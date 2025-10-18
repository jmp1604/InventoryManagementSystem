function redirectTo(path) {
    path = path.startsWith('/') ? path.substring(1) : path;
    window.location.href = path;
}

const MIN_LOADING_TIME = 1000;

document.addEventListener('DOMContentLoaded', async () => {
    // Record start time
    const startTime = Date.now();

    try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
            console.error('Error checking auth status:', error.message);
            await ensureMinLoadingTime(startTime);
            redirectTo('pages/auth.html');
            return;
        }

        await ensureMinLoadingTime(startTime);

        if (session) {
            redirectTo('pages/dashboard.html');
        } else {
            redirectTo('pages/auth.html');
        }
    } catch (error) {
        console.error('Error in auth check:', error);
        await ensureMinLoadingTime(startTime);
        redirectTo('pages/auth.html');
    }
});

async function ensureMinLoadingTime(startTime) {
    const elapsedTime = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsedTime);
    
    if (remainingTime > 0) {
        await new Promise(resolve => setTimeout(resolve, remainingTime));
    }
}