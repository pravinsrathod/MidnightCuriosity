
export interface BotResponse {
    text: string;
    shouldEscalate: boolean;
    suggestions?: string[];
}

/**
 * Ultra-Enhanced Local Support Bot Knowledge Base.
 * Features: Deep Role-Awareness, Contextual Intent Matching, and Actionable Suggestions.
 */

const ROLE_AWARE_TIPS: Record<string, Record<string, {text: string[], suggestions?: string[]}>> = {
    'STUDENT': {
        '/': { 
            text: ["Welcome back, $USER_NAME! All your classes are primed and ready. Dive into 'Daily Classes' to get ahead.", "Your learning streak is looking strong! Keep it up on the $TENANT Leaderboard."], 
            suggestions: ["Check Homework", "My Progress", "Join Live Class"] 
        },
        '/knowledge-graph': { 
            text: ["Explore your personalized Learning Map. Every node represents a core concept in $TENANT.", "Tap on subjects to see prerequisites and unlock new levels of understanding."], 
            suggestions: ["Prerequisites", "Subject Map", "Ask a Doubt"] 
        },
        '/homework': { 
            text: ["Don't let those assignments stack up! Priority tasks are highlighted for you.", "You can submit work by simple photo uploads or file attachments."], 
            suggestions: ["Due Soon", "Completed Work", "Exam Dates"] 
        },
        '/grade': {
            text: ["Analyze your performance metrics here. We track attendance, quiz scores, and more.", "Consistency is key! Regular attendance boosts your overall $TENANT score."],
            suggestions: ["Attendance Detail", "Recent Activity", "Subject Stats"]
        },
        '/profile': {
            text: ["Personalize your $TENANT experience. You can update your bio and view earned badges here.", "Keep your contact info current to receive urgent school alerts."],
            suggestions: ["Change Avatar", "My Badges", "Privacy Settings"]
        },
        '/doubts': {
            text: ["Stuck on a problem? Post it here for quick teacher assistance or peer support.", "Browse through asked questions to find instant solutions to common hurdles."],
            suggestions: ["Post Question", "My Doubts", "Search Doubts"]
        },
        '/poll': {
            text: ["Make your voice count! Participate in active school polls and shape $TENANT's future."],
            suggestions: ["Vote Now", "Past Polls", "Results"]
        }
    },
    'PARENT': {
        '/parent-home': { 
            text: ["Manage your family's education from one spot. Swipe or tap to switch between your children.", "Overview child attendance, pending homework, and fee status instantly."], 
            suggestions: ["View Attendance", "Pay Fees", "Progress Report"] 
        },
        '/parent-fees': { 
            text: ["Securely manage billing and tuition. We offer instant receipts and multiple payment methods.", "Review historical payments or download fee structures for your records."], 
            suggestions: ["Payment History", "Fee Breakdown", "Contact Office"] 
        },
        '/parent-attendance': {
            text: ["Daily tracking of your child's presence. Detailed metrics available below the calendar.", "Request leaves or verify leave approvals directly through the parent portal."],
            suggestions: ["Monthly Summary", "Apply for Leave", "Leave Status"]
        },
        '/parent-homework': {
            text: ["Support your child's progress by tracking daily assignments and due dates.", "Review teacher comments and grade feedback for completed work."],
            suggestions: ["Pending Tasks", "Completed Work", "Teacher Feedback"]
        }
    },
    'ADMIN': {
        '/admin-dashboard': { 
            text: ["Welcome Commander! Broadcast critical alerts or manage students and staff here.", "View real-time institute metrics including total attendance and fee collection."], 
            suggestions: ["Broadcast Alert", "Student Records", "Fee Summary"] 
        },
        '/admin-students': {
            text: ["Full registry management. Add, edit, or archive student profiles and roles.", "Quick-search by name, enrollment ID, or parent contact."],
            suggestions: ["Add Student", "Bulk Upload", "Export PDF"]
        }
    }
};

const CONTEXT_TIPS: Record<string, string[]> = {
    '/attendance': [
        "Visualize your monthly presence. Green = Present, Red = Absent, Yellow = Holiday.",
        "Precision tracking: tap any date to see exact check-in/out timestamps.",
        "Missing a record? Please notify the class teacher within 24 hours."
    ],
    '/profile': [
        "Your digital identity in $TENANT. You can update profile photos and basic details here.",
        "Security Tip: Regularly update your phone and email to keep your account safe."
    ],
    '/fees': ["Detailed ledger view: track every penny spent on tuition and activities.", "Instant digital receipts are generated for every successful payment."],
    '/homework': ["Focus on 'Due Soon' to avoid penalties and stay ahead of the curve.", "Collaboration is key: check if there are any peer-review tasks assigned."],
    '/knowledge-graph': ["This represents your cumulative knowledge journey. Completed nodes turn green!", "Follow the lines to visualize prerequisite dependencies between subjects."],
    'default': [
        "Welcome! I am $TENANT AI Bot. How can I facilitate your session today?",
        "Pro-Tip: Use keywords like 'fees', 'homework', 'attendance', or 'help' for instant answers.",
        "Experiencing issues? Type 'bug' or 'error' to escalate directly to our technicians."
    ]
};

const INTENT_MATCHERS: Array<{keywords: string[], response: string, suggestions?: string[], role?: string}> = [
    {
        keywords: ['how', 'to', 'use'],
        response: "Navigation is simple! Use the bottom tabs for core features. Students focus on 'Classes' & 'Homework', while Parents manage 'Fees' & 'Child Progress'.",
        suggestions: ["Student Guide", "Parent Guide", "Quick Tour"]
    },
    {
        keywords: ['where', 'is', 'find'],
        response: "Core modules are always in the bottom navigation. For specific tools like 'Polls' or 'Leaderboard', check the Dashboard or Profile menus.",
        suggestions: ["Feature List", "Navigation Help", "Search App"]
    },
    {
        keywords: ['problem', 'not', 'working', 'failed', 'stuck'],
        response: "I'm sorry you're facing a hurdle! I can capture technical diagnostic data and escalate this to our engineering team immediately.",
        suggestions: ["Escalate Bug", "Refresh Page", "Contact Support"]
    },
    {
        keywords: ['change', 'password', 'login', 'reset'],
        response: "Account security is vital. To reset your password, visit the login screen and use the 'Forgot Password' link to receive a secure code.",
        suggestions: ["Reset Password", "Login Help", "Account Security"]
    },
    {
        keywords: ['new', 'child', 'add', 'account'],
        response: "To add another child, tap the 'Person Plus' icon in the top header of the Parent Dashboard. You'll need the child's registered ID.",
        suggestions: ["Add Child Account", "Enrollment Help"]
    },
    {
        keywords: ['teacher', 'contact', 'doubt', 'question'],
        response: "Need pedagogical help? Visit the 'Doubts' section to post a question or directly message teachers if allowed by your institute.",
        suggestions: ["Ask Teacher", "Public Doubts", "My Questions"]
    },
    {
        keywords: ['refund', 'money', 'billing'],
        response: "$TENANT manages refund policies locally. Please visit the school office or contact the accounts department for a refund request.",
        suggestions: ["Office Contact", "Payment History"]
    },
    {
        keywords: ['broadcast', 'megaphone'],
        response: "Admins can send push notifications by tapping the Megaphone/Bell icon. You can target specific classes or send to the whole school.",
        suggestions: ["Send Alert", "Message History"],
        role: "ADMIN"
    }
];

const KEYWORD_RESPONSES: Record<string, {text: string[], suggestions?: string[], role?: string}> = {
    'bug': { text: ['I apologize for the technical glitch. Should I initiate an escalation to our Dev team?'], suggestions: ['Escalate Now', 'Later'] },
    'error': { text: ['Are you seeing a specific error code? I can capture logs and report this for you.'], suggestions: ['Report Error', 'Try Again'] },
    'fees': { text: ['Manage bills, view breakdown, and pay tuition securely in the "Fees" section.'], suggestions: ['Pay Fees', 'Billing History'] },
    'payment': { text: ['We support Credit/Debit cards, UPI, and Bank Transfers for seamless payments.'], suggestions: ['Pay Pending', 'Receipts'] },
    'attendance': { text: ['Track daily presence, view monthly trends, and apply for leaves here.'], suggestions: ['View Attendance', 'Apply Leave'] },
    'homework': { text: ['Stay organized! Check pending assignments, due dates, and submission status.'], suggestions: ['Pending Tasks', 'Daily Work'] },
    'assignment': { text: ['All homework and projects are consolidated into your Homework calendar.'], suggestions: ['Calender View'] },
    'live': { text: ['Real-time learning: Active sessions appear as a live banner on your Dashboard.'], suggestions: ['Join Class', 'Next Session'] },
    'lecture': { text: ['Review recorded lectures anytime within the Knowledge Graph or Lectures module.'], suggestions: ['Recorded Videos', 'Search Subject'] },
    'grade': { text: ['Performance metrics: View results for every quiz, test, and exam your institute conducts.'], suggestions: ['Result Card', 'Rank Detail'] },
    'child': { text: ['Parent Mode: Tap the top-right child icon to switch views or add family members.'], suggestions: ['Switch Child', 'Add Member'] },
    'switch': { text: ['Instant Child Switch: Simply tap the current child\'s name in the header to change focus.'], suggestions: ['Change Focus'] },
    'hello': { text: ['Greetings, $USER_NAME! I am here to streamline your experience at $TENANT. What\'s on your mind?'], suggestions: ['Feature Overiew', 'Quick Help'] },
    'hi': { text: ['Hello! Ready to dive back into learning with $TENANT? How can I assist?'], suggestions: ['Daily Classes', 'Check Tasks'] },
    'help': { text: ['I can guide you through navigation, payments, or technical support. What do you need?'], suggestions: ['General Guide', 'Raise Ticket', 'Chat with Human'] },
    'contact': { text: ['You can reach $TENANT at +91-XXXXX-XXXXX or visit the campus during office hours.'], suggestions: ['Office Location', 'Email Support'] },
    'missing': { text: ['If content appears missing, ensure your internet is stable. If persistent, reach out for support.'], suggestions: ['Refresh App', 'Reload Content'] },
    'delete': { text: ['Account deletion is permanent and wipes all history. Proceed with caution in Profile settings.'], suggestions: ['Privacy Policy'] },
    'password': { text: ['Security Protocol: Update passwords regularly. Use the login screen for resets.'], suggestions: ['Update Password'] },
    'report': { text: ['Academic Reports: Official PDFs are available in the Exam section post-evaluation.'], suggestions: ['Download PDF', 'View Results'] },
    'syllabus': { text: ['The curriculum structure is fully detailed in the Knowledge Graph section.'], suggestions: ['Download Plan'] },
    'timetable': { text: ['Never miss a bell! Your daily timetable is dynamic and updated in your Dashboard.'], suggestions: ['Today\'s Schedule'] },
    'quiz': { text: ['Challenge yourself! Complete quizzes to earn marks, points, and rank up.'], suggestions: ['Available Quizes', 'Quiz Results'] },
    'badge': { text: ['Earn badges for consistency, high scores, and community activity.'], suggestions: ['View My Badges'] },
    'points': { text: ['Accumulate points for every interaction! Points are linked to your global leaderboard rank.'], suggestions: ['Rankings', 'Point History'] },
    'leaderboard': { text: ['Top performance area: See the highest achievers across the institute.'], suggestions: ['Rankings', 'My Position'] },
    'broadcast': { text: ['Broadcast Interface: Push urgent news to all users with one tap.'], suggestions: ['New Alert'], role: "ADMIN" }
};

/**
 * The brain of the bot. It uses an upgraded hierarchy of matching:
 * 1. Escalation check (Immediate priority).
 * 2. Intent-based matching (Phased multi-word patterns).
 * 3. Keyword-based matching (Topic detection).
 * 4. Advanced Role-Awareness (Screen-specific context mapped to user persona).
 * 5. General context tips.
 * 6. Final Intelligent Fallback.
 */
export const getBotResponse = (
    query: string, 
    pathname: string, 
    role: string = 'STUDENT',
    tenantName: string = 'EduPro', 
    userName: string = 'User'
): BotResponse => {
    const lowerQuery = (query || "").toLowerCase().trim();
    const safePathname = pathname || "/";
    const safeRole = (role || "STUDENT").toUpperCase();
    const safeTenantName = tenantName || "EduPro";

    // 1. Check for escalation/technical issues first
    const escalationKeywords = ['bug', 'error', 'broken', 'failed', 'not working', 'crash', 'glitch'];
    if (escalationKeywords.some(kw => lowerQuery.includes(kw))) {
        return {
            text: "I've detected a possible technical hurdle. To assist you better, I can package diagnostic info and escalate this to our engineering team immediately. Ready?",
            shouldEscalate: true,
            suggestions: ["Escalate Now", "No, Thanks", "How to fix?"]
        };
    }

    // 2. Intent-based matching (Multi-keyword smart matching)
    for (const matcher of INTENT_MATCHERS) {
        if (matcher.keywords.every(kw => lowerQuery.includes(kw))) {
            if (!matcher.role || matcher.role === safeRole) {
                return { text: matcher.response.replace(/\$TENANT/g, safeTenantName), suggestions: matcher.suggestions, shouldEscalate: false };
            }
        }
    }

    // 3. Keyword-based matching (Topic Detection)
    const sortedKeywords = Object.keys(KEYWORD_RESPONSES).sort((a, b) => b.length - a.length);
    for (const keyword of sortedKeywords) {
        const isMatch = keyword.length < 4 
            ? new RegExp(`\\b${keyword}\\b`, 'i').test(lowerQuery)
            : lowerQuery.includes(keyword);

        if (isMatch) {
            const data = KEYWORD_RESPONSES[keyword];
            if (!data.role || data.role === safeRole) {
                const response = data.text[Math.floor(Math.random() * data.text.length)];
                return {
                    text: response
                        .replace(/\$TENANT/g, safeTenantName)
                        .replace(/\$USER_NAME/g, userName),
                    suggestions: data.suggestions,
                    shouldEscalate: false
                };
            }
        }
    }

    // 4. Role-aware screen context (Highest relevance for local bot)
    const roleTips = ROLE_AWARE_TIPS[safeRole];
    if (roleTips && roleTips[safePathname]) {
        const data = roleTips[safePathname];
        const tip = data.text[Math.floor(Math.random() * data.text.length)];
        return { 
            text: tip.replace(/\$TENANT/g, safeTenantName).replace(/\$USER_NAME/g, userName), 
            suggestions: data.suggestions,
            shouldEscalate: false 
        };
    }

    // 5. General context tips (Path matching)
    let contextTips = CONTEXT_TIPS[safePathname];
    if (!contextTips) {
        // Dynamic routes prefix check
        const prefixPath = Object.keys(CONTEXT_TIPS).find(p => p !== '/' && safePathname.startsWith(p));
        if (prefixPath) contextTips = CONTEXT_TIPS[prefixPath];
    }

    if (contextTips) {
        return { 
            text: contextTips[Math.floor(Math.random() * contextTips.length)]
                .replace(/\$TENANT/g, safeTenantName)
                .replace(/\$USER_NAME/g, userName), 
            shouldEscalate: false 
        };
    }

    // 6. Intelligent Fallback (Personality-driven)
    const fallbackTips = CONTEXT_TIPS['default'];
    return {
        text: fallbackTips[Math.floor(Math.random() * fallbackTips.length)]
            .replace(/\$TENANT/g, safeTenantName)
            .replace(/\$USER_NAME/g, userName),
        shouldEscalate: false,
        suggestions: ["Check Fees", "Learning Help", "My Attendance", "Support Ticket"]
    };
};
