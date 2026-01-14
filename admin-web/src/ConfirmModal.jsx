import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

const ConfirmModal = ({ isOpen, title, message, onConfirm, onCancel, confirmText = "Confirm", cancelText = "Cancel", isDangerous = false, type = 'confirm' }) => {
    const [inputValue, setInputValue] = useState("");

    // Reset input when modal opens
    useEffect(() => {
        if (isOpen) setInputValue("");
    }, [isOpen]);

    if (!isOpen) return null;

    const handleConfirm = () => {
        if (type === 'prompt') {
            onConfirm(inputValue);
        } else {
            onConfirm();
        }
    };

    const modalContent = (
        <div style={styles.overlay}>
            <div style={styles.modal}>
                <h3 style={{ ...styles.title, color: isDangerous ? 'var(--danger)' : 'var(--text)' }}>
                    {title || (type === 'alert' ? 'Alert' : type === 'prompt' ? 'Input Required' : 'Confirm')}
                </h3>
                <p style={styles.message}>{message}</p>

                {type === 'prompt' && (
                    <input
                        type="text"
                        style={styles.input}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder="Enter value..."
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleConfirm();
                        }}
                    />
                )}

                <div style={styles.actions}>
                    {type !== 'alert' && (
                        <button onClick={onCancel} style={styles.cancelBtn}>{cancelText}</button>
                    )}
                    <button
                        onClick={handleConfirm}
                        style={{
                            ...styles.confirmBtn,
                            background: isDangerous ? 'var(--danger)' : 'var(--primary)'
                        }}
                    >
                        {confirmText || (type === 'alert' ? 'OK' : 'Confirm')}
                    </button>
                </div>
            </div>
        </div>
    );

    // Use portal to ensure it stays on top of z-index stack
    return createPortal(modalContent, document.body);
};

const styles = {
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)', // Darker dim for focus
        backdropFilter: 'blur(5px)', // Glassmorphism effect
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 9999, // High Z-Index
    },
    modal: {
        backgroundColor: '#1e293b', // Matches card bg
        borderRadius: '16px',
        padding: '24px',
        width: '90%',
        maxWidth: '450px',
        border: '1px solid #334155',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4)',
        animation: 'fadeIn 0.2s ease-out'
    },
    title: {
        marginTop: 0,
        marginBottom: '12px',
        fontSize: '1.25rem',
        fontWeight: '600',
    },
    message: {
        color: '#94a3b8', // text-secondary
        marginBottom: '24px',
        lineHeight: '1.5',
        fontSize: '1rem',
        whiteSpace: 'pre-wrap', // Handles newlines in messages
    },
    input: {
        width: '100%',
        padding: '12px',
        marginBottom: '24px',
        borderRadius: '8px',
        border: '1px solid #475569',
        backgroundColor: '#0f172a',
        color: 'white',
        fontSize: '1rem',
        outline: 'none'
    },
    actions: {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '12px',
    },
    cancelBtn: {
        background: 'transparent',
        border: '1px solid #475569',
        color: '#cbd5e1',
        padding: '10px 20px',
        borderRadius: '8px',
        cursor: 'pointer',
        fontSize: '0.9rem',
        fontWeight: '500',
    },
    confirmBtn: {
        border: 'none',
        color: 'white',
        padding: '10px 20px',
        borderRadius: '8px',
        cursor: 'pointer',
        fontSize: '0.9rem',
        fontWeight: '600',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)',
    }
};

export default ConfirmModal;
