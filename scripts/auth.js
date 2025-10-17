// Authentication Handler
// Add this script to auth.html

// Check if already logged in
document.addEventListener('DOMContentLoaded', async () => {
    const session = await window.authHelpers.checkAuth();
    if (session) {
        window.location.href = 'dashboard.html';
        return;
    }
});

// Login form submission
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const rememberMe = document.getElementById('remember-me').checked;
    
    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email,
            password
        });
        
        if (error) throw error;
        
        // Get or create user record in users table
        const { data: userData, error: userError } = await supabaseClient
            .from('users')
            .select('*')
            .eq('email', email)
            .single();
        
        if (userError && userError.code !== 'PGRST116') {
            console.error('Error fetching user:', userError);
        }
        
        // Update last login
        if (userData) {
            await supabaseClient
                .from('users')
                .update({ last_login: new Date().toISOString() })
                .eq('user_id', userData.user_id);
        }
        
        // Redirect to dashboard
        window.location.href = 'dashboard.html';
        
    } catch (error) {
        console.error('Login error:', error);
        alert('Login failed: ' + error.message);
    }
});

// Signup form submission
document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const firstName = document.getElementById('signup-first-name').value.trim();
    const lastName = document.getElementById('signup-last-name').value.trim();
    const phone = document.getElementById('signup-phone').value.trim();
    const role = document.getElementById('signup-role').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const confirmPassword = document.getElementById('signup-confirm-password').value;
    
    // Validate required fields
    if (!firstName) {
        alert('Please enter your first name');
        return;
    }

    // Basic phone validation (optional)
    if (phone && !/^\+?[0-9 ()-]{7,20}$/.test(phone)) {
        alert('Please enter a valid phone number');
        return;
    }

    // Validate passwords match
    if (password !== confirmPassword) {
        alert('Passwords do not match!');
        return;
    }
    
    // Validate password strength
    if (password.length < 6) {
        alert('Password must be at least 6 characters long');
        return;
    }
    
    try {
        // Sign up with Supabase Auth
        const { data: authData, error: authError } = await supabaseClient.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: (firstName + ' ' + lastName).trim(),
                    phone: phone || null,
                    role: role
                }
            }
        });
        
        if (authError) throw authError;
        
        // Create user record in users table
        const { error: insertError } = await supabaseClient
            .from('users')
            .insert([{
                user_id: authData.user.id,
                first_name: firstName,
                last_name: lastName,
                email: email,
                phone: phone || null,
                role: role || 'user',
                is_active: true
            }]);
        
        if (insertError) {
            console.error('Error creating user record:', insertError);
        }
        
        alert('Account created successfully! Please check your email for verification.');
        
        // Redirect to dashboard
        window.location.href = 'dashboard.html';
        
    } catch (error) {
        console.error('Signup error:', error);
        alert('Signup failed: ' + error.message);
    }
});