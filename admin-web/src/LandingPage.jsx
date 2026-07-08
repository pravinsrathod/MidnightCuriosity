import React from 'react';

export default function LandingPage({ onLoginClick }) {
    return (
        <div className="landing-page animate-fade-in" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)', color: 'var(--text-primary)', position: 'relative', overflow: 'hidden' }}>
            {/* Background glowing blobs */}
            <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '40vw', height: '40vw', background: 'radial-gradient(circle, rgba(59,130,246,0.15) 0%, rgba(0,0,0,0) 70%)', borderRadius: '50%', zIndex: 0 }}></div>
            <div style={{ position: 'absolute', top: '20%', right: '-10%', width: '30vw', height: '30vw', background: 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, rgba(0,0,0,0) 70%)', borderRadius: '50%', zIndex: 0 }}></div>

            {/* Header */}
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 40px', background: 'rgba(2, 6, 23, 0.6)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.05)', position: 'sticky', top: 0, zIndex: 100 }}>
                <div className="logo" style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>
                    🚀 <span>EduPro Admin</span>
                </div>
                <div>
                    <button className="btn btn-primary" onClick={onLoginClick}>
                        Login / Get Started
                    </button>
                </div>
            </header>

            {/* Hero Section (Centered) */}
            <section style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', textAlign: 'center', flex: 1 }}>
                <div style={{ maxWidth: '800px', marginBottom: '60px' }}>
                    <h1 style={{ fontSize: '4.5rem', marginBottom: '24px', background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-1px' }}>
                        Empower Your Institute with EduPro
                    </h1>
                    <p style={{ fontSize: '1.3rem', color: 'var(--text-secondary)', marginBottom: '40px', lineHeight: 1.6, maxWidth: '600px', margin: '0 auto 40px auto' }}>
                        The all-in-one platform to manage students, conduct live classes, track attendance, collect fees, and utilize AI-driven features to supercharge your educational institute.
                    </p>
                    <button className="btn btn-primary" style={{ padding: '18px 36px', fontSize: '1.2rem', boxShadow: '0 10px 30px rgba(59, 130, 246, 0.4)', borderRadius: '30px' }} onClick={onLoginClick}>
                        Register Your Institute Today
                    </button>
                </div>

                {/* Main Video centrally located inside a glass frame */}
                <div className="glass-panel" style={{ width: '100%', maxWidth: '900px', padding: '20px', borderRadius: '24px', background: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(59, 130, 246, 0.3)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px rgba(59, 130, 246, 0.2)' }}>
                    <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, borderRadius: '16px', overflow: 'hidden' }}>
                        <iframe 
                            src="https://www.youtube.com/embed/ELkQYsKYAvo" 
                            title="EduPro Explainer Video" 
                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }} 
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                            allowFullScreen
                        ></iframe>
                    </div>
                </div>
            </section>

            {/* Features Section (Grid) */}
            <section style={{ position: 'relative', zIndex: 1, padding: '100px 40px', background: 'rgba(15, 23, 42, 0.5)' }}>
                <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
                    <h2 style={{ textAlign: 'center', fontSize: '3rem', marginBottom: '60px', fontWeight: 800 }}>Why Choose EduPro?</h2>
                    <div className="grid-2">
                        {[
                            { title: 'Student Management', desc: 'Easily track student details, attendance, and performance in one centralized place.', icon: '👥', color: 'rgba(59,130,246,0.15)' },
                            { title: 'AI-Powered Lectures', desc: 'Generate quizzes, notes, and study material automatically using Gemini AI.', icon: '🤖', color: 'rgba(139,92,246,0.15)' },
                            { title: 'Live Classes & Polls', desc: 'Engage students with live interactive sessions and real-time interactive polling.', icon: '📹', color: 'rgba(236,72,153,0.15)' },
                            { title: 'Fees & Timetable', desc: 'Streamline fee collection, invoicing, and complex schedule management effortlessly.', icon: '💰', color: 'rgba(16,185,129,0.15)' }
                        ].map((feature, i) => (
                            <div key={i} className="card" style={{ padding: '40px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', background: 'var(--bg-tertiary)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <div style={{ background: feature.color, padding: '16px', borderRadius: '16px', fontSize: '2.5rem', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '80px', height: '80px' }}>
                                    {feature.icon}
                                </div>
                                <h3 style={{ fontSize: '1.8rem', marginBottom: '16px' }}>{feature.title}</h3>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', lineHeight: 1.6 }}>{feature.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Parental Benefits Section (Massive Feature Card) */}
            <section style={{ position: 'relative', zIndex: 1, padding: '100px 20px', display: 'flex', justifyContent: 'center' }}>
                <div className="glass-panel" style={{ width: '100%', maxWidth: '1100px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '40px', padding: '60px', borderRadius: '32px', background: 'linear-gradient(145deg, rgba(30,41,59,0.8) 0%, rgba(15,23,42,0.9) 100%)', border: '1px solid rgba(139,92,246,0.2)', boxShadow: '0 30px 60px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)' }}>
                    <div style={{ flex: '1 1 400px' }}>
                        <div style={{ display: 'inline-block', background: 'rgba(139,92,246,0.2)', color: '#a78bfa', padding: '6px 16px', borderRadius: '20px', fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '20px' }}>For Parents</div>
                        <h2 style={{ fontSize: '3rem', marginBottom: '24px', fontWeight: 800, lineHeight: 1.2 }}>
                            Parental Involvement, Simplified.
                        </h2>
                        <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)', marginBottom: '32px', lineHeight: 1.7 }}>
                            EduPro isn't just for institutes and students. We provide dedicated tools for parents to track their child's progress, monitor attendance, pay fees securely, and communicate directly with teachers.
                        </p>
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: 'var(--text-primary)', fontSize: '1.1rem', lineHeight: 2 }}>
                            <li style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><span style={{ color: '#10b981' }}>✔</span> Real-time progress tracking</li>
                            <li style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><span style={{ color: '#10b981' }}>✔</span> Secure online fee payments</li>
                            <li style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><span style={{ color: '#10b981' }}>✔</span> Direct teacher communication</li>
                            <li style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><span style={{ color: '#10b981' }}>✔</span> Instant attendance notifications</li>
                        </ul>
                    </div>

                    <div style={{ flex: '1 1 400px', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
                            <iframe 
                                src="https://www.youtube.com/embed/WamJJw4XrV8" 
                                title="EduPro Parental Benefits" 
                                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }} 
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                                allowFullScreen
                            ></iframe>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer style={{ position: 'relative', zIndex: 1, padding: '40px', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}>
                <p>&copy; {new Date().getFullYear()} EduPro by Midnight Curiosity. All rights reserved.</p>
            </footer>
        </div>
    );
}
