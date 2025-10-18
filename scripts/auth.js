document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const accessToken = params.get('access_token');
    const type = params.get('type');

    if (type === 'signup' && accessToken) {
        try {
            const { data, error } = await supabaseClient.auth.setSession({
                access_token: accessToken,
                refresh_token: params.get('refresh_token')
            });
            
            if (error) throw error;
            
            alert('Email confirmed successfully!');
            window.location.href = 'dashboard.html';
            return;
        } catch (error) {
            console.error('Error confirming email:', error);
            alert('Error confirming email: ' + error.message);
        }
    }
    
    // Check if user is already logged in
    const session = await window.authHelpers.checkAuth();
    if (session) {
        window.location.href = 'dashboard.html';
        return;
    }
});

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
        
        // Check if email is confirmed
        if (!data.user.email_confirmed_at) {
            alert('Please confirm your email before logging in. Check your inbox for the confirmation link.');
            await supabaseClient.auth.signOut();
            return;
        }
        
        const { data: userData, error: userError } = await supabaseClient
            .from('users')
            .select('*')
            .eq('email', email)
            .single();
        
        if (userError && userError.code !== 'PGRST116') {
            console.error('Error fetching user:', userError);
        }
        
        if (userData) {
            await supabaseClient
                .from('users')
                .update({ last_login: new Date().toISOString() })
                .eq('user_id', userData.user_id);
        }
        
        window.location.href = 'dashboard.html';
        
    } catch (error) {
        console.error('Login error:', error);
        alert('Login failed: ' + error.message);
    }
});

document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const firstName = document.getElementById('signup-first-name').value.trim();
    const lastName = document.getElementById('signup-last-name').value.trim();
    const phone = document.getElementById('signup-phone').value.trim();
    const role = document.getElementById('signup-role').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const confirmPassword = document.getElementById('signup-confirm-password').value;
    
    if (!firstName) {
        alert('Please enter your first name');
        return;
    }

    if (phone && !/^\+?[0-9 ()-]{7,20}$/.test(phone)) {
        alert('Please enter a valid phone number');
        return;
    }

    if (password !== confirmPassword) {
        alert('Passwords do not match!');
        return;
    }
    
    if (password.length < 6) {
        alert('Password must be at least 6 characters long');
        return;
    }
    
    try {
        const { data: authData, error: authError } = await supabaseClient.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: (firstName + ' ' + lastName).trim(),
                    phone: phone || null,
                    role: role
                },
                // This is the URL Supabase will redirect to after email confirmation
                emailRedirectTo: window.location.origin + '/pages/auth.html'
            }
        });
        
        if (authError) throw authError;
        
        // Only create user record if signup was successful
        if (authData.user) {
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
        }
        
        alert('Account created successfully! Please check your email for a confirmation link. You must confirm your email before logging in.');

    } catch (error) {
        console.error('Signup error:', error);
        alert('Signup failed: ' + error.message);
    }
});