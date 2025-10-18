// Function to load and inject the sidebar
async function loadSidebar() {
    try {
        const response = await fetch('/components/sidebar.html');
        const sidebarContent = await response.text();
        
        // Get the first .app-container element
        const appContainer = document.querySelector('.app-container');
        if (appContainer) {
            // Insert the sidebar as the first child of app-container
            appContainer.insertAdjacentHTML('afterbegin', sidebarContent);
            
            // Add active class to current page's nav item
            const currentPage = window.location.pathname.split('/').pop();
            const navItems = document.querySelectorAll('.nav-item');
            navItems.forEach(item => {
                if (item.getAttribute('href').includes(currentPage)) {
                    item.classList.add('active');
                }
            });
        }
    } catch (error) {
        console.error('Error loading sidebar:', error);
    }
}

// Load the sidebar when the DOM is ready
document.addEventListener('DOMContentLoaded', loadSidebar);