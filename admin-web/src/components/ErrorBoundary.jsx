import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // You can also log the error to an error reporting service
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // Fallback UI
      return (
        <div style={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          background: '#0f172a',
          color: '#f1f5f9',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '20px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '4rem', marginBottom: '24px' }}>🛡️</div>
          <h1 style={{ fontSize: '2rem', marginBottom: '16px', color: '#3b82f6' }}>Something went wrong</h1>
          <p style={{ maxWidth: '500px', lineHeight: '1.6', color: '#94a3b8', marginBottom: '32px' }}>
            A rendering error occurred in this module. We've intercepted it to prevent the entire system from crashing.
          </p>
          
          <div style={{ 
            background: 'rgba(239, 68, 68, 0.1)', 
            border: '1px solid rgba(239, 68, 68, 0.2)', 
            padding: '16px', 
            borderRadius: '12px',
            marginBottom: '32px',
            maxWidth: '600px',
            width: '100%',
            overflowX: 'auto',
            textAlign: 'left'
          }}>
            <code style={{ color: '#f87171', fontSize: '0.9rem' }}>
              {this.state.error && this.state.error.toString()}
            </code>
          </div>

          <div style={{ display: 'flex', gap: '16px' }}>
            <button 
              onClick={() => window.location.reload()}
              style={{
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                padding: '12px 24px',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
              }}
            >
              Reload Interface
            </button>
            <button 
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{
                background: 'transparent',
                color: '#94a3b8',
                border: '1px solid #334155',
                padding: '12px 24px',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children; 
  }
}

export default ErrorBoundary;
