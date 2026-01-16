package com.smarthive.backend.service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import com.smarthive.backend.model.ApplianceLog;
import com.smarthive.backend.model.EmailLog;
import com.smarthive.backend.repository.EmailLogRepository;
import com.smarthive.backend.repository.LogRepository;

@Service
public class EnergyService {

    @Autowired
    private LogRepository logRepository;
    
    @Autowired
    private EmailLogRepository emailLogRepository;

    @Autowired
    private NotificationService notificationService;

    @Autowired
    private BillingService billingService;

    @Value("${ml.service.url}")
    private String mlServiceUrl;

    private final RestTemplate restTemplate = new RestTemplate();

    // MEMORY
    private Map<String, Integer> breakdownCounters = new ConcurrentHashMap<>();
    private Map<String, ApplianceLog> latestReadings = new ConcurrentHashMap<>();
    private Map<String, String> deviceStateMap = new ConcurrentHashMap<>();
    private Map<String, Boolean> emailSentState = new ConcurrentHashMap<>();

    // --- 1. NEW: BASE WATTS MAP (The "Green Zone" Definition) ---
    // These values MATCH your Simulator App.js exactly.
    private static final Map<String, Double> BASE_WATTS = new HashMap<>();
    static {
        BASE_WATTS.put("Fan", 65.0);
        BASE_WATTS.put("Light", 15.0);
        BASE_WATTS.put("AC", 1500.0);
        BASE_WATTS.put("Geyser", 2000.0);
        BASE_WATTS.put("Fridge", 150.0);
        BASE_WATTS.put("WashingMachine", 500.0);
        BASE_WATTS.put("Microwave", 1000.0);
        BASE_WATTS.put("TV", 100.0);
    }

    // THRESHOLDS (Upper Limits)
    private static final Map<String, Double> BREAKDOWN_THRESHOLDS = new HashMap<>();
    static {
        BREAKDOWN_THRESHOLDS.put("AC", 2500.0);
        BREAKDOWN_THRESHOLDS.put("Fridge", 250.0);
        BREAKDOWN_THRESHOLDS.put("Geyser", 3000.0);
        BREAKDOWN_THRESHOLDS.put("WashingMachine", 2000.0); 
        BREAKDOWN_THRESHOLDS.put("Microwave", 1500.0);
        BREAKDOWN_THRESHOLDS.put("Fan", 100.0);
        BREAKDOWN_THRESHOLDS.put("Light", 30.0); 
        BREAKDOWN_THRESHOLDS.put("TV", 150.0);
    }

    public ApplianceLog processReading(Map<String, Object> reading) {
        String deviceId = (String) reading.get("id");
        String deviceType = (String) reading.get("type");
        double voltage = Double.parseDouble(reading.get("v").toString());
        double power = Double.parseDouble(reading.get("p").toString());
        boolean isInjecting = reading.containsKey("injecting") ? (boolean) reading.get("injecting") : false;

        // --- 2. NEW LOGIC: THE "GREEN ZONE" CHECK ---
        // If the power is within the rated Base Wattage (or 0), it is AUTOMATICALLY OK.
        // This solves the Real IoT Node 0W/9W issue.
        double baseLimit = BASE_WATTS.getOrDefault(deviceType, 0.0);
        boolean isWithinBaseLimits = power <= baseLimit;

        // Default Flags
        boolean isBreakdown = false;
        boolean isMlAnomaly = false;

        // ONLY run advanced checks if we exceeded the Base Watts
        if (!isWithinBaseLimits) {
            
            // A. PHYSICS OVERRIDE (Upper Safety Nets)
            boolean isSafeZone = false;
            if (deviceType.equals("Geyser") && power < 2900) isSafeZone = true;
            if (deviceType.equals("WashingMachine") && power < 1950) isSafeZone = true;
            if (deviceType.equals("AC") && power < 2400) isSafeZone = true;

            // B. CONSULT BRAIN (ML)
            if (!isSafeZone) {
                try {
                    Map<String, Object> request = new HashMap<>();
                    request.put("voltage", voltage);
                    request.put("power", power);
                    request.put("deviceType", deviceType);
                    Map<String, Object> response = restTemplate.postForObject(mlServiceUrl, request, Map.class);
                    if (response != null && response.containsKey("anomaly")) {
                        isMlAnomaly = (boolean) response.get("anomaly");
                    }
                } catch (Exception e) { isMlAnomaly = false; }
            }

            // C. BREAKDOWN LOGIC (10 Strikes)
            double limit = BREAKDOWN_THRESHOLDS.getOrDefault(deviceType, 99999.0);
            if (power > limit) {
                int strikes = breakdownCounters.getOrDefault(deviceId, 0) + 1;
                breakdownCounters.put(deviceId, strikes);
                if (strikes >= 10) isBreakdown = true; 
            } else {
                breakdownCounters.put(deviceId, 0);
            }
        } else {
            // If we are <= Base Watts, reset breakdown counters safely
            breakdownCounters.put(deviceId, 0);
        }

        // --- EMAIL TRIGGER LOGIC ---
        boolean wasBroken = emailSentState.getOrDefault(deviceId, false);
        if (isBreakdown && !wasBroken) {
            String timeStr = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
            notificationService.sendBreakdownAlert(deviceId, timeStr);
            billingService.generateBill(deviceId, deviceType);
            emailSentState.put(deviceId, true);
        }
        else if (!isBreakdown && wasBroken) {
            emailSentState.put(deviceId, false);
        }

        // --- DETERMINE UI STATUS ---
        String uiStatus = "OK"; 
        String uiMessage = "System Nominal";
        boolean shouldLog = false;
        boolean finalAnomalyState = false;

        // Priority 1: Breakdown
        if (isBreakdown) {
            uiStatus = "FAIL";
            uiMessage = "CRITICAL BREAKDOWN";
            finalAnomalyState = true;
            shouldLog = true; 
        } 
        // Priority 2: ML Anomaly (Only if NOT within base limits)
        else if (isMlAnomaly && !isWithinBaseLimits) {
            if (isInjecting) {
                uiStatus = "WARN"; 
                uiMessage = "Anomaly Detected";
                finalAnomalyState = true;
                shouldLog = true; 
            } else {
                uiStatus = "SPIKE"; 
                uiMessage = "Temporary Spike";
                finalAnomalyState = false;
                shouldLog = false; 
            }
        }
        // Priority 3: Base Limits (Explicit OK)
        else if (isWithinBaseLimits) {
            uiStatus = "OK";
            uiMessage = "System Nominal";
            finalAnomalyState = false;
        }

        // State Change Logic for DB Logging
        String lastState = deviceStateMap.getOrDefault(deviceId, "OK");
        if (shouldLog) {
            if (uiStatus.equals(lastState)) {
                shouldLog = false; 
            } else {
                deviceStateMap.put(deviceId, uiStatus);
            }
        }
        if (uiStatus.equals("OK")) deviceStateMap.put(deviceId, "OK");

        // CREATE LOG OBJECT
        ApplianceLog log = new ApplianceLog();
        log.setDeviceId(deviceId);
        log.setDeviceType(deviceType);
        log.setVoltage(voltage);
        log.setPower(power);
        log.setAnomaly(finalAnomalyState);
        log.setBreakdown(isBreakdown);
        log.setTimestamp(LocalDateTime.now());
        
        if (shouldLog) {
            logRepository.save(log);
        }
        
        log.setTransientStatus(uiStatus); 
        log.setTransientMessage(uiMessage);
        
        latestReadings.put(deviceId, log);

        return log;
    }

    // --- DASHBOARD API ---
    public Map<String, Object> getDashboardStats() {
        Map<String, Object> stats = new HashMap<>();
        LocalDateTime now = LocalDateTime.now();

        latestReadings.entrySet().removeIf(entry -> 
            Duration.between(entry.getValue().getTimestamp(), now).getSeconds() > 4
        );

        double totalPower = latestReadings.values().stream().mapToDouble(ApplianceLog::getPower).sum();
        long activeThreats = latestReadings.values().stream().filter(ApplianceLog::isBreakdown).count();
        
        List<Map<String, Object>> deviceList = latestReadings.values().stream().map(log -> {
            Map<String, Object> map = new HashMap<>();
            map.put("deviceId", log.getDeviceId());
            map.put("deviceType", log.getDeviceType());
            map.put("power", log.getPower());
            map.put("voltage", log.getVoltage());
            map.put("breakdown", log.isBreakdown());
            map.put("anomaly", log.isAnomaly());
            map.put("uiStatus", log.getTransientStatus()); 
            map.put("uiMessage", log.getTransientMessage());
            return map;
        }).sorted(Comparator.comparing(m -> (String)m.get("deviceId"))).collect(Collectors.toList());

        stats.put("totalPower", totalPower);
        stats.put("activeThreats", activeThreats);
        stats.put("devices", deviceList);
        
        return stats;
    }

    public List<ApplianceLog> getAllAnomalies() {
        return logRepository.findAll().stream()
                .sorted((a, b) -> b.getId().compareTo(a.getId()))
                .limit(50)
                .collect(Collectors.toList());
    }
    
    public List<EmailLog> getAllEmailLogs() {
        return emailLogRepository.findAllByOrderBySentAtDesc();
    }

    /*public void electricityModel() throws IOException
    {
         ProcessBuilder pb = new ProcessBuilder("py ml_service.py");
         Process process=pb.start();
    }*/
}