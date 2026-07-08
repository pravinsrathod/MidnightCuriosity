import React, { useState } from 'react';
import { auth } from './firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { db } from './firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

export default function AdminLogin({ onBack }) {
    const [identifier, setIdentifier] = useState(''); // Email or Phone
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const [isSignUp, setIsSignUp] = useState(false);
    const [instituteName, setInstituteName] = useState('');

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
                if (!instituteName) {
                    setError("Please enter the Institute Name.");
                    setLoading(false);
                    return;
                }

                const userCredential = await createUserWithEmailAndPassword(auth, identifier.includes('@') ? identifier : emailToUse, password);
                const user = userCredential.user;

                // For new Admin, we auto-generate a tenantId based on a shorter version of UID or a random string
                const generatedTenantId = `inst_${Math.random().toString(36).substring(2, 7)}`;

                // 1. Create User Document for Admin
                const userData = {
                    email: identifier.includes('@') ? identifier : emailToUse,
                    role: 'admin',
                    tenantId: generatedTenantId,
                    status: 'PENDING_APPROVAL',
                    createdAt: serverTimestamp()
                };
                if (isPhone) userData.phoneNumber = identifier.replace(/[^0-9]/g, '');

                await setDoc(doc(db, "users", user.uid), userData);

                // 2. Create Tenant Document
                await setDoc(doc(db, "tenants", generatedTenantId), {
                    name: instituteName || "My New Institute",
                    code: generatedTenantId,
                    adminUid: user.uid,
                    createdAt: serverTimestamp(),
                    isActive: false, // Default to false until approved
                    status: 'PENDING_APPROVAL'
                });

                setSuccess("Signup successful! Your institute is pending approval by the Super Admin.");
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
        <div className="app-layout" style={{ justifyContent: 'center', alignItems: 'center', background: 'var(--bg-primary)' }}>
            <div className="card animate-fade-in" style={{ width: '100%', maxWidth: '400px', padding: '40px', position: 'relative' }}>
                {onBack && (
                    <button 
                        onClick={onBack} 
                        style={{ position: 'absolute', top: '20px', left: '20px', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem' }}
                        title="Back to Home"
                    >
                        ←
                    </button>
                )}
                <div className="logo" style={{ justifyContent: 'center', marginBottom: '1.5rem' }}>
                    🚀 <span>EduPro Admin</span>
                </div>
                <h2 style={{ textAlign: 'center', marginBottom: '8px' }}>{isSignUp ? 'Create Admin' : 'Welcome Back'}</h2>
                <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: '32px', fontSize: '0.9rem' }}>
                    {isSignUp ? 'Register a new admin account' : 'Please sign in to continue'}
                </p>

                {error && <div className="badge badge-danger" style={{ width: '100%', marginBottom: '20px', textAlign: 'center', padding: '12px' }}>{error}</div>}
                {success && <div className="badge badge-success" style={{ width: '100%', marginBottom: '20px', textAlign: 'center', padding: '12px' }}>{success}</div>}

                <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {isSignUp && (
                        <div className="form-group">
                            <label className="label">Institute Name</label>
                            <input
                                type="text"
                                value={instituteName}
                                onChange={(e) => setInstituteName(e.target.value)}
                                placeholder="e.g. Curiosity High School"
                                required
                            />
                        </div>
                    )}

                    <div className="form-group">
                        <label className="label">Mobile Number OR Email</label>
                        <input
                            type="text"
                            value={identifier}
                            onChange={(e) => setIdentifier(e.target.value)}
                            placeholder="e.g. 9876543210 or admin@abc.com"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <label className="label" style={{ marginBottom: 0 }}>Password</label>
                            {!isSignUp && (
                                <button
                                    type="button"
                                    onClick={handleForgotPassword}
                                    style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.8rem' }}
                                >
                                    Forgot Password?
                                </button>
                            )}
                        </div>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required={!loading}
                        />
                    </div>

                    <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }} disabled={loading}>
                        {loading ? 'Processing...' : (isSignUp ? 'Create Account' : 'Sign In')}
                    </button>
                </form>

                <div style={{ marginTop: '32px', textAlign: 'center' }}>
                    <button
                        type="button"
                        onClick={() => setIsSignUp(!isSignUp)}
                        style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.9rem', textDecoration: 'none' }}
                    >
                        {isSignUp ? 'Already have an account? Login' : 'Need an account? Sign Up'}
                    </button>
                </div>
            </div>
        </div>
    );
}
