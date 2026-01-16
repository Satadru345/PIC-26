package com.smarthive.backend.service;

import com.razorpay.Order;
import com.razorpay.RazorpayClient;
import com.razorpay.Utils;
import com.smarthive.backend.model.Bill;
import com.smarthive.backend.model.PaymentTransaction;
import com.smarthive.backend.repository.BillRepository;
import com.smarthive.backend.repository.PaymentTransactionRepository;
import org.json.JSONObject;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class BillingService {

    @Autowired
    private BillRepository billRepository;

    @Autowired
    private PaymentTransactionRepository transactionRepository;

    @Autowired
    private JavaMailSender mailSender;

    @Value("${razorpay.key.id}")
    private String keyId;

    @Value("${razorpay.key.secret}")
    private String keySecret;
    
    // THE RATE CARD
    private static final Map<String, Double> SERVICE_CHARGES = new HashMap<>();
    static {
        SERVICE_CHARGES.put("AC", 1500.0);
        SERVICE_CHARGES.put("Geyser", 1200.0);
        SERVICE_CHARGES.put("WashingMachine", 800.0);
        SERVICE_CHARGES.put("Microwave", 600.0);
        SERVICE_CHARGES.put("Fridge", 500.0);
        SERVICE_CHARGES.put("TV", 400.0);
        SERVICE_CHARGES.put("Fan", 250.0);
        SERVICE_CHARGES.put("Light", 200.0);
    }

    // 1. GENERATE BILL (Called when Breakdown happens)
    public void generateBill(String deviceId, String deviceType) {
        double amount = SERVICE_CHARGES.getOrDefault(deviceType, 500.0);
        Bill bill = new Bill();
        bill.setDeviceId(deviceId);
        bill.setAmount(amount);
        bill.setStatus("PENDING");
        billRepository.save(bill);
    }

    // 2. GET PENDING BILLS
    public List<Bill> getPendingBills() {
        return billRepository.findByStatus("PENDING");
    }

    // 3. CREATE RAZORPAY ORDER (Consolidated)
    public String createOrder(double amount) throws Exception {
        RazorpayClient razorpay = new RazorpayClient(keyId, keySecret);
        JSONObject orderRequest = new JSONObject();
        orderRequest.put("amount", amount * 100); // Amount in Paise
        orderRequest.put("currency", "INR");
        orderRequest.put("receipt", "txn_" + System.currentTimeMillis());

        Order order = razorpay.orders.create(orderRequest);
        return order.toString();
    }

    // 4. VERIFY PAYMENT & CLOSE BILLS
    public boolean verifyPayment(String orderId, String paymentId, String signature, String payerName, String payerEmail) {
        try {
            // A. Cryptographic Verification
            JSONObject options = new JSONObject();
            options.put("razorpay_order_id", orderId);
            options.put("razorpay_payment_id", paymentId);
            options.put("razorpay_signature", signature);
            boolean isValid = Utils.verifyPaymentSignature(options, keySecret);

            if (isValid) {
                // B. Close Pending Bills
                List<Bill> pendingBills = billRepository.findByStatus("PENDING");
                double totalAmount = pendingBills.stream().mapToDouble(Bill::getAmount).sum();
                String items = pendingBills.stream().map(Bill::getDeviceId).collect(Collectors.joining(", "));

                pendingBills.forEach(bill -> {
                    bill.setStatus("PAID");
                    billRepository.save(bill);
                });

                // C. Log Transaction
                PaymentTransaction txn = new PaymentTransaction();
                txn.setRazorpayPaymentId(paymentId);
                txn.setPayerName(payerName);
                txn.setPayerEmail(payerEmail);
                txn.setAmount(totalAmount);
                txn.setItemsPaid(items);
                transactionRepository.save(txn);

                // D. Send Receipt Email
                sendReceipt(payerEmail, payerName, totalAmount, items, paymentId);
                
                return true;
            }
            return false;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    // 5. SEND EMAIL RECEIPT
    private void sendReceipt(String toEmail, String name, double amount, String items, String txnId) {
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom("satadrughosh345@gmail.com");
            message.setTo(toEmail);
            message.setSubject("Payment Receipt - SmartHive Maintenance");
            message.setText(String.format("""
                Dear %s,
                
                Thank you for your payment. Here is your transaction receipt.
                
                Transaction ID: %s
                Amount Paid: ₹%.2f
                
                Services Covered:
                %s
                
                Status: SUCCESS
                
                Regards,
                SmartHive Finance Team
                """, name, txnId, amount, items));
            
            mailSender.send(message);
        } catch (Exception e) {
            System.err.println("Failed to send receipt: " + e.getMessage());
        }
    }
    
    // 6. GET ALL TRANSACTIONS
    public List<PaymentTransaction> getAllTransactions() {
        return transactionRepository.findAllByOrderByTimestampDesc();
    }
    
    // 7. GET TOTAL BALANCE
    public double getTotalBalance() {
        return transactionRepository.findAll().stream().mapToDouble(PaymentTransaction::getAmount).sum();
    }
}