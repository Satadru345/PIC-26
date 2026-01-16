package com.smarthive.backend.repository;

import com.smarthive.backend.model.ApplianceLog;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface LogRepository extends JpaRepository<ApplianceLog, Long> {
    // Helper to find recent logs for dashboard
    List<ApplianceLog> findTop10ByOrderByTimestampDesc();
}