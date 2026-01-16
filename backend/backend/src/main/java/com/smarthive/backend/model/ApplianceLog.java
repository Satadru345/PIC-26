package com.smarthive.backend.model;

import java.time.LocalDateTime;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import lombok.Data;

@Entity
@Data
@Table(name = "appliance_logs")
public class ApplianceLog {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String deviceId;      // e.g., "Fan_1"
    private String deviceType;    // e.g., "Fan"
    private double voltage;
    private double power;

    private boolean isAnomaly;    // True if ML detects anomaly
    private boolean isBreakdown;  // True if Strike Count exceeded

    private LocalDateTime timestamp;

    @PrePersist
    protected void onCreate() {
        timestamp = LocalDateTime.now();
    }

    // --- TRANSIENT FIELDS (Not saved to DB, but sent to Frontend) ---

    @Transient // Uses jakarta.persistence.Transient automatically
    private String transientStatus = "OK";

    @Transient
    private String transientMessage = "System Nominal";

    // Getters and Setters (Explicitly added just in case Lombok misses them for Transients)
    public String getTransientStatus() { return transientStatus; }
    public void setTransientStatus(String s) { this.transientStatus = s; }
    public String getTransientMessage() { return transientMessage; }
    public void setTransientMessage(String s) { this.transientMessage = s; }
}