const SUPABASE_URL = 'https://wxhkhxsxftundtrahpst.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4aGtoeHN4ZnR1bmR0cmFocHN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1Nzg3NzcsImV4cCI6MjA3NjE1NDc3N30.mP2VgTOzAQSBkm1VjmBJRP08vi--pSJ3KBhdqTo5mkY';

// Initialize Supabase Client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Check if user is authenticated
async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
}

// Redirect if not authenticated
async function requireAuth() {
    const session = await checkAuth();
    if (!session) {
        window.location.href = '/pages/auth.html';
        return null;
    }
    return session;
}

// Get current user
async function getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

// Sign out
async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (!error) {
        window.location.href = '/pages/auth.html';
    }
    return error;
}

// Add sign-out listener to all pages
document.addEventListener('DOMContentLoaded', () => {
    const signOutBtn = document.querySelector('.sign-out-btn');
    if (signOutBtn) {
        signOutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await signOut();
        });
    }
});

// Export for use in other files
window.supabaseClient = supabase;
window.authHelpers = {
    checkAuth,
    requireAuth,
    getCurrentUser,
    signOut
};