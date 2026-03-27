import React from 'react';
import { Redirect } from 'expo-router';

/**
 * Legacy Parent Dashboard Redirector
 * 
 * This file is kept to prevent crashes on older app builds (v3.0.0 and below)
 * that may still have cached navigation state or external links pointing to 
 * /parent-dashboard. It safely redirects users to the new tab-based structure.
 */
export default function ParentDashboardRedirect() {
    return <Redirect href="/(tabs)/parent-home" />;
}
