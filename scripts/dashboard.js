document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication
    const session = await window.authHelpers.requireAuth();
    if (!session) return;
    
    // Load dashboard data
    await loadDashboardStats();
    await loadRecentActivity();
    
    // Set up real-time subscriptions
    setupRealtimeSubscriptions();
});

// Load dashboard statistics
async function loadDashboardStats() {
    try {
        // Get total products count
        const { count: totalProducts } = await supabaseClient
            .from('products')
            .select('*', { count: 'exact', head: true });
        
        // Get inventory stock data
        const { data: stockData } = await supabaseClient
            .from('inventory_stock')
            .select('quantity_on_hand, quantity_reserved, quantity_available, product:products(unit_price)');
        
        // Calculate stats
        let inStock = 0;
        let lowStock = 0;
        let totalValue = 0;
        
        for (const item of stockData || []) {
            const available = item.quantity_available || 0;
            
            // Count in stock (assuming min threshold of 10)
            if (available >= 10) {
                inStock++;
            } else if (available > 0) {
                lowStock++;
            }
            
            // Calculate total value
            const unitPrice = item.product?.unit_price || 0;
            totalValue += (item.quantity_on_hand || 0) * unitPrice;
        }
        
        // Update UI
        document.getElementById('total-products').textContent = totalProducts || 0;
        document.getElementById('in-stock').textContent = inStock;
        document.getElementById('low-stock').textContent = lowStock;
        document.getElementById('total-value').textContent = `$${totalValue.toFixed(2)}`;
        
    } catch (error) {
        console.error('Error loading dashboard stats:', error);
    }
}

// Load recent activity
async function loadRecentActivity() {
    try {
        const { data: movements } = await supabaseClient
            .from('stock_movements')
            .select(`
                movement_id,
                product_id,
                movement_type,
                quantity_change,
                movement_date,
                notes,
                product:products(product_name)
            `)
            .order('movement_date', { ascending: false })
            .limit(10);
        
        const activityContainer = document.getElementById('recent-activity');
        
        if (!movements || movements.length === 0) {
            activityContainer.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">No recent activity</p>';
            return;
        }
        
        activityContainer.innerHTML = movements.map(movement => {
            const date = new Date(movement.movement_date);
            const timeAgo = getTimeAgo(date);
            const icon = movement.movement_type === 'inbound' ? 'arrow-down' : 'arrow-up';
            const color = movement.movement_type === 'inbound' ? 'var(--success)' : 'var(--danger)';
            
            return `
                <div style="display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border-color);">
                    <div style="width: 32px; height: 32px; border-radius: 50%; background: ${color}20; display: flex; align-items: center; justify-content: center;">
                        <i class="fas fa-${icon}" style="color: ${color}; font-size: 14px;"></i>
                    </div>
                    <div style="flex: 1;">
                        <div style="font-size: 14px; font-weight: 500;">${movement.product?.product_name || 'Unknown'}</div>
                        <div style="font-size: 12px; color: var(--text-secondary);">
                            ${movement.movement_type === 'inbound' ? '+' : '-'}${Math.abs(movement.quantity_change)} units
                            ${movement.notes ? '• ' + movement.notes : ''}
                        </div>
                    </div>
                    <div style="font-size: 12px; color: var(--text-muted);">${timeAgo}</div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading recent activity:', error);
    }
}

// Set up real-time subscriptions
function setupRealtimeSubscriptions() {
    // Subscribe to stock movements
    supabaseClient
        .channel('stock_movements_changes')
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'stock_movements' },
            (payload) => {
                console.log('Stock movement change:', payload);
                loadDashboardStats();
                loadRecentActivity();
            }
        )
        .subscribe();
    
    // Subscribe to inventory stock changes
    supabaseClient
        .channel('inventory_stock_changes')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'inventory_stock' },
            (payload) => {
                console.log('Inventory stock change:', payload);
                loadDashboardStats();
            }
        )
        .subscribe();
}

// Helper function to get time ago
function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    const intervals = {
        year: 31536000,
        month: 2592000,
        week: 604800,
        day: 86400,
        hour: 3600,
        minute: 60,
        second: 1
    };
    
    for (const [unit, secondsInUnit] of Object.entries(intervals)) {
        const interval = Math.floor(seconds / secondsInUnit);
        if (interval >= 1) {
            return `${interval} ${unit}${interval !== 1 ? 's' : ''} ago`;
        }
    }
    
    return 'just now';
}