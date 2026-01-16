package com.smarthive.backend.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import com.smarthive.backend.model.EmailLog;
import com.smarthive.backend.repository.EmailLogRepository;

@Service
public class NotificationService {

    @Autowired
    private JavaMailSender mailSender;

    @Autowired
    private EmailLogRepository emailLogRepository;

    // CONFIGURABLE DETAILS (Change here in future)
    private final String SENDER_EMAIL = "satadrughosh345@gmail.com";
    private final String RECEIVER_EMAIL = "ghoshsatadru71@gmail.com";
    private final String SENDER_ADDRESS = "150, Dharmatala Road, Salkia, Howrah-711201";
    private final String APARTMENT_NAME = "Narayana Apartment";
    private final String ROOM_NUMBER = "403";

    @Async // Runs in background (Non-blocking)
    public void sendBreakdownAlert(String deviceId, String timestamp) {
        System.out.println("Initiating Email Sequence for " + deviceId);

        String subject = "URGENT: Breakdown Predicted for " + deviceId;
        
        String body = String.format("""
            URGENT MAINTENANCE REQUIRED
            
            Appliance ID: %s
            Status: CRITICAL BREAKDOWN PREDICTED
            Time of Incident: %s
            
            Location:
            %s
            %s
            Room No: %s
            
            Action Required:
            The AI system has detected a fatal anomaly pattern. Immediate manual inspection is required to prevent permanent hardware failure.
            
            From:
            SmartHive Admin
            """, deviceId, timestamp, APARTMENT_NAME, SENDER_ADDRESS, ROOM_NUMBER);

        try {
            // 1. Send Actual Email
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(SENDER_EMAIL);
            message.setTo(RECEIVER_EMAIL);
            message.setSubject(subject);
            message.setText(body);
            
            mailSender.send(message);
            System.out.println("EMAIL SENT SUCCESSFULLY TO " + RECEIVER_EMAIL);

            // 2. Log to Database
            EmailLog log = new EmailLog();
            log.setRecipient(RECEIVER_EMAIL);
            log.setSubject(subject);
            log.setBody(body);
            log.setDeviceId(deviceId);
            emailLogRepository.save(log);

        } catch (Exception e) {
            System.err.println("FAILED TO SEND EMAIL: " + e.getMessage());
        }
    }
}