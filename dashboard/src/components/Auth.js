import React, { useState } from 'react';
import axios from 'axios';
import './Auth.css'; 

const Auth = ({ onLogin }) => {
    const [isLogin, setIsLogin] = useState(true); // Toggle between Login/Register
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
        const url = `http://localhost:8080${endpoint}`;

        try {
            const res = await axios.post(url, { username, password });

            if (isLogin) {
                // LOGIN SUCCESS: Save Token & Enter
                const token = res.data.jwt;
                localStorage.setItem('jwtToken', token); // Store key in browser
                onLogin(token); // Tell App.js we are in
            } else {
                // REGISTER SUCCESS
                alert("Registration Successful! Please Login.");
                setIsLogin(true); // Switch to login view
            }
        } catch (err) {
            console.error("Auth Error:", err);
            setError(err.response?.data || "Authentication Failed");
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-box">
                <h2>{isLogin ? 'SmartHive Secure Access' : 'Register New Admin'}</h2>
                
                {error && <div className="error-msg">{error}</div>}

                <form onSubmit={handleSubmit}>
                    <div className="input-group">
                        <label>Username</label>
                        <input 
                            type="text" 
                            value={username} 
                            onChange={(e) => setUsername(e.target.value)} 
                            required 
                        />
                    </div>
                    <div className="input-group">
                        <label>Password</label>
                        <input 
                            type="password" 
                            value={password} 
                            onChange={(e) => setPassword(e.target.value)} 
                            required 
                        />
                    </div>
                    <button type="submit" className="auth-btn">
                        {isLogin ? 'LOGIN' : 'REGISTER ADMIN'}
                    </button>
                </form>

                <p className="toggle-text" onClick={() => setIsLogin(!isLogin)}>
                    {isLogin ? "Need an account? Register" : "Have an account? Login"}
                </p>
            </div>
        </div>
    );
};

export default Auth;