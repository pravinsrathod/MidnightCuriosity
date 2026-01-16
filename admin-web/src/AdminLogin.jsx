import React, { useState } from 'react';
import { auth } from './firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { db } from './firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

export default function AdminLogin() {
    const [identifier, setIdentifier] = useState(''); // Email or Phone
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const [isSignUp, setIsSignUp] = useState(false);

    const handleForgotPassword = async () => {
        if (!identifier) {
            setError("Please enter your email or phone number first.");
            return;
        }

        setLoading(true);
        setError('');
        setSuccess('');

        // Determine if input is Phone or Email
        const isPhone = /^\+?[0-9\s]+$/.test(identifier) && !identifier.includes('@');
        let emailToUse = identifier;

        if (isPhone) {
            const cleanPhone = identifier.replace(/[^0-9]/g, '');
            emailToUse = `${cleanPhone}@midnightcuriosity.com`;
        }

        try {
            await sendPasswordResetEmail(auth, emailToUse);
            setSuccess("Password reset email sent! Please check your inbox.");
        } catch (err) {
            console.error(err);
            setError("Failed to send reset email: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAuth = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess('');

        // Determine if input is Phone or Email
        const isPhone = /^\+?[0-9\s]+$/.test(identifier) && !identifier.includes('@');
        let emailToUse = identifier;

        if (isPhone) {
            const cleanPhone = identifier.replace(/[^0-9]/g, '');
            if (cleanPhone.length < 8) {
                setError("Invalid phone number length.");
                setLoading(false);
                return;
            }
            emailToUse = `${cleanPhone}@midnightcuriosity.com`;
        }

        try {
            if (isSignUp) {
                const userCredential = await createUserWithEmailAndPassword(auth, identifier.includes('@') ? identifier : emailToUse, password);
                const user = userCredential.user;

                // For new Admin, we auto-generate a tenantId based on a shorter version of UID or a random string
                const generatedTenantId = `inst_${Math.random().toString(36).substring(2, 7)}`;

                // 1. Create User Document for Admin
                const userData = {
                    email: identifier.includes('@') ? identifier : emailToUse,
                    role: 'admin',
                    tenantId: generatedTenantId,
                    createdAt: serverTimestamp()
                };
                if (isPhone) userData.phoneNumber = identifier.replace(/[^0-9]/g, '');

                await setDoc(doc(db, "users", user.uid), userData);

                // 2. Create Tenant Document
                await setDoc(doc(db, "tenants", generatedTenantId), {
                    name: "My New Institute",
                    code: generatedTenantId,
                    adminUid: user.uid,
                    createdAt: serverTimestamp(),
                    isActive: true
                });
            } else {
                await signInWithEmailAndPassword(auth, identifier.includes('@') ? identifier : emailToUse, password);
            }
        } catch (err) {
            console.error(err);
            let msg = "Authentication failed.";
            if (err.code === 'auth/weak-password') msg = "Password should be at least 6 characters.";
            if (err.code === 'auth/email-already-in-use') msg = "User already exists.";
            if (err.code === 'auth/invalid-email') msg = "Invalid format.";
            if (err.code === 'auth/user-not-found') msg = "No user found.";
            if (err.code === 'auth/wrong-password') msg = "Incorrect password.";
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={styles.container}>
            <div style={styles.card}>
                <div style={styles.logo}>🚀 EduPro Admin</div>
                <h2 style={styles.title}>{isSignUp ? 'Create Admin' : 'Welcome Back'}</h2>
                <p style={styles.subtitle}>{isSignUp ? 'Register a new admin account' : 'Please sign in to continue'}</p>

                {error && <div style={styles.error}>{error}</div>}
                {success && <div style={styles.success}>{success}</div>}

                <form onSubmit={handleAuth} style={styles.form}>
                    <div style={styles.inputGroup}>
                        <label style={styles.label}>Mobile Number OR Email</label>
                        <input
                            type="text"
                            value={identifier}
                            onChange={(e) => setIdentifier(e.target.value)}
                            style={styles.input}
                            placeholder="e.g. 9876543210 or admin@abc.com"
                            required
                        />
                    </div>

                    <div style={styles.inputGroup}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label style={styles.label}>Password</label>
                            {!isSignUp && (
                                <button
                                    type="button"
                                    onClick={handleForgotPassword}
                                    style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '0.8rem' }}
                                >
                                    Forgot Password?
                                </button>
                            )}
                        </div>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            style={styles.input}
                            placeholder="••••••••"
                            required={!loading}
                        />
                    </div>

                    <button type="submit" style={styles.button} disabled={loading}>
                        {loading ? 'Processing...' : (isSignUp ? 'Create Account' : 'Sign In')}
                    </button>
                </form>

                <div style={styles.footer}>
                    <button
                        type="button"
                        onClick={() => setIsSignUp(!isSignUp)}
                        style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                        {isSignUp ? 'Already have an account? Login' : 'Need an account? Sign Up'}
                    </button>
                </div>
            </div>
        </div>
    );
}

const styles = {
    container: {
        height: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: '#0f172a', // Dark dashboard bg
        color: '#f8fafc',
        fontFamily: 'Inter, sans-serif'
    },
    card: {
        background: '#1e293b',
        padding: '40px',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '400px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
        border: '1px solid #334155'
    },
    logo: {
        textAlign: 'center',
        fontSize: '1.5rem',
        fontWeight: 'bold',
        marginBottom: '20px',
        color: '#3b82f6'
    },
    title: {
        textAlign: 'center',
        fontSize: '1.5rem',
        marginBottom: '8px'
    },
    subtitle: {
        textAlign: 'center',
        color: '#94a3b8',
        marginBottom: '32px',
        fontSize: '0.9rem'
    },
    form: {
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
    },
    inputGroup: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
    },
    label: {
        fontSize: '0.9rem',
        fontWeight: '500',
        color: '#cbd5e1'
    },
    input: {
        padding: '12px',
        borderRadius: '8px',
        border: '1px solid #475569',
        background: '#0f172a',
        color: '#fff',
        fontSize: '1rem',
        outline: 'none'
    },
    button: {
        marginTop: '10px',
        padding: '14px',
        background: '#3b82f6',
        color: 'white',
        border: 'none',
        borderRadius: '12px',
        fontSize: '1rem',
        fontWeight: 'bold',
        cursor: 'pointer',
        transition: 'background 0.2s'
    },
    error: {
        background: 'rgba(239, 68, 68, 0.1)',
        color: '#ef4444',
        padding: '12px',
        borderRadius: '8px',
        marginBottom: '20px',
        textAlign: 'center',
        fontSize: '0.9rem'
    },
    success: {
        background: 'rgba(34, 197, 94, 0.1)',
        color: '#22c55e',
        padding: '12px',
        borderRadius: '8px',
        marginBottom: '20px',
        textAlign: 'center',
        fontSize: '0.9rem'
    },
    footer: {
        marginTop: '32px',
        textAlign: 'center'
    }
};
