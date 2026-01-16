package com.smarthive.backend.repository;

import com.smarthive.backend.model.EmailLog;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface EmailLogRepository extends JpaRepository<EmailLog, Long> {
    // We will fetch logs sorted by latest first
    List<EmailLog> findAllByOrderBySentAtDesc();
}