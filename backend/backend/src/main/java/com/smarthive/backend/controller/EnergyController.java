package com.smarthive.backend.controller;

import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.smarthive.backend.model.ApplianceLog;
import com.smarthive.backend.service.BillingService;
import com.smarthive.backend.service.EnergyService;

@RestController
@RequestMapping("/api/energy")
@CrossOrigin(origins = "*") // Critical for React
public class EnergyController {

    @Autowired
    private EnergyService energyService;

    @Autowired
    private BillingService billingService;

    // 1. Simulator Stream (POST)
    @PostMapping("/stream")
    public ResponseEntity<?> receiveData(@RequestBody Map<String, Object> reading) {
        ApplianceLog log = energyService.processReading(reading);
        return ResponseEntity.ok(log);
    }
    
    // 2. Dashboard Stats (GET) - NEW!
    // The Dashboard will poll this every 1 second
    @GetMapping("/dashboard")
    public ResponseEntity<Map<String, Object>> getDashboardStats() {
        return ResponseEntity.ok(energyService.getDashboardStats());
    }

    // 3. Global Logs (GET) - NEW!
    @GetMapping("/logs")
    public ResponseEntity<List<ApplianceLog>> getLogs() {
        return ResponseEntity.ok(energyService.getAllAnomalies());
    }

    // ADD THIS NEW ENDPOINT
    @GetMapping("/emails")
    public List<com.smarthive.backend.model.EmailLog> getEmailLogs() {
        return energyService.getAllEmailLogs();
    }

    // BILLING AND PAYMENT ENDPOINTS

    // 1. Get Pending Bills
    @GetMapping("/bills/pending")
    public List<com.smarthive.backend.model.Bill> getPendingBills() {
        return billingService.getPendingBills();
    }

    // 2. Create Order
    @PostMapping("/payment/create-order")
    public String createPaymentOrder(@RequestBody Map<String, Double> data) throws Exception {
        return billingService.createOrder(data.get("amount"));
    }

    // 3. Verify Payment
    @PostMapping("/payment/verify")
    public boolean verifyPayment(@RequestBody Map<String, String> data) {
        return billingService.verifyPayment(
            data.get("orderId"),
            data.get("paymentId"),
            data.get("signature"),
            data.get("payerName"),
            data.get("payerEmail")
        );
    }

    // 4. Get Transactions
    @GetMapping("/payment/history")
    public List<com.smarthive.backend.model.PaymentTransaction> getPaymentHistory() {
        return billingService.getAllTransactions();
    }

    // 5. Get Balance
    @GetMapping("/payment/balance")
    public double getCommonBalance() {
        return billingService.getTotalBalance();
    }

    /*@PostMapping("/energyModel")
    public ResponseEntity<?> startModel()
    {
         try
         {
             energyService.electricityModel();
             return ResponseEntity.ok().body("model started");
         }

         catch(Exception e)
         {
             return ResponseEntity.badRequest().body(e.getMessage());
         }
    }*/
}