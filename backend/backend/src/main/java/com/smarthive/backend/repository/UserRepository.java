package com.smarthive.backend.repository;

import com.smarthive.backend.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {
    // This magic method finds a user by their username
    Optional<User> findByUsername(String username);
}