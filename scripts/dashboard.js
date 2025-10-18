// Chart instances
let salesTrendChart = null;
let stockDistributionChart = null;
let categoryChart = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication
    const session = await window.authHelpers.requireAuth();
    if (!session) return;
    
    // Load dashboard data
    await loadDashboardStats();
    await loadRecentActivity();
    await loadLowStockAlerts();
    
    // Initialize charts
    initializeCharts();
    
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
        
        // Get inventory stock data with product details
        const { data: stockData } = await supabaseClient
            .from('inventory_stock')
            .select(`
                quantity_on_hand,
                quantity_reserved,
                quantity_available,
                product:products(unit_price, category_id)
            `);
        
        // Calculate stats
        let inStock = 0;
        let lowStock = 0;
        let totalValue = 0;
        
        for (const item of stockData || []) {
            const available = item.quantity_available || 0;
            
            // Count in stock (threshold of 10)
            if (available >= 10) {
                inStock++;
            } else if (available > 0 && available < 10) {
                lowStock++;
            }
            
            // Calculate total value
            const unitPrice = item.product?.unit_price || 0;
            totalValue += (item.quantity_on_hand || 0) * unitPrice;
        }
        
        // Update UI with animations
        animateValue('total-products', 0, totalProducts || 0, 1000);
        animateValue('in-stock', 0, inStock, 1000);
        animateValue('low-stock', 0, lowStock, 1000);
        animateValue('total-value', 0, totalValue, 1000, true);
        
        // Update charts with real data
        updateCharts(stockData);
        
    } catch (error) {
        console.error('Error loading dashboard stats:', error);
        showError('Failed to load dashboard statistics');
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
            .limit(8);
        
        const activityContainer = document.getElementById('recent-activity');
        
        if (!movements || movements.length === 0) {
            activityContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <p>No recent activity</p>
                </div>
            `;
            return;
        }
        
        activityContainer.innerHTML = movements.map(movement => {
            const date = new Date(movement.movement_date);
            const timeAgo = getTimeAgo(date);
            const icon = movement.movement_type === 'inbound' ? 'arrow-down' : 'arrow-up';
            const iconClass = movement.movement_type === 'inbound' ? 'inbound' : 'outbound';
            
            return `
                <div class="activity-item">
                    <div class="activity-icon ${iconClass}">
                        <i class="fas fa-${icon}"></i>
                    </div>
                    <div class="activity-content">
                        <div class="activity-title">${movement.product?.product_name || 'Unknown'}</div>
                        <div class="activity-details">
                            ${movement.movement_type === 'inbound' ? '+' : '-'}${Math.abs(movement.quantity_change)} units
                            ${movement.notes ? ' • ' + movement.notes : ''}
                        </div>
                    </div>
                    <div class="activity-time">${timeAgo}</div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading recent activity:', error);
    }
}

// Load low stock alerts
async function loadLowStockAlerts() {
    try {
        const { data: lowStockItems } = await supabaseClient
            .from('inventory_stock')
            .select(`
                stock_id,
                quantity_available,
                product:products(product_id, product_name, sku)
            `)
            .lt('quantity_available', 10)
            .gt('quantity_available', 0)
            .limit(5);
        
        const alertsContainer = document.getElementById('low-stock-alerts');
        const alertCount = document.getElementById('alert-count');
        
        alertCount.textContent = lowStockItems?.length || 0;
        
        if (!lowStockItems || lowStockItems.length === 0) {
            alertsContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-check-circle"></i>
                    <p>All products are well stocked</p>
                </div>
            `;
            return;
        }
        
        alertsContainer.innerHTML = lowStockItems.map(item => `
            <div class="alert-item">
                <div class="alert-icon">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <div class="alert-content">
                    <div class="alert-product">${item.product?.product_name || 'Unknown'}</div>
                    <div class="alert-details">
                        SKU: ${item.product?.sku || 'N/A'} • 
                        Only <span class="alert-stock">${item.quantity_available} units</span> remaining
                    </div>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error loading low stock alerts:', error);
    }
}

// Initialize charts
function initializeCharts() {
    // Sales Trend Chart
    const salesCtx = document.getElementById('salesTrendChart');
    if (salesCtx) {
        salesTrendChart = new Chart(salesCtx, {
            type: 'line',
            data: {
                labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
                datasets: [{
                    label: 'Sales',
                    data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: '#f3f4f6'
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        }
                    }
                }
            }
        });
    }
    
    // Stock Distribution Chart
    const stockCtx = document.getElementById('stockDistributionChart');
    if (stockCtx) {
        stockDistributionChart = new Chart(stockCtx, {
            type: 'doughnut',
            data: {
                labels: ['In Stock', 'Low Stock', 'Out of Stock'],
                datasets: [{
                    data: [0, 0, 0],
                    backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }
    
    // Category Chart
    const categoryCtx = document.getElementById('categoryChart');
    if (categoryCtx) {
        categoryChart = new Chart(categoryCtx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Total Value',
                    data: [],
                    backgroundColor: '#2563eb',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: '#f3f4f6'
                        },
                        ticks: {
                            callback: function(value) {
                                return '₱' + value.toLocaleString();
                            }
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        }
                    }
                }
            }
        });
    }
}

// Update charts with real data
async function updateCharts(stockData) {
    try {
        // Update stock distribution
        let inStock = 0;
        let lowStock = 0;
        let outOfStock = 0;
        
        stockData?.forEach(item => {
            const available = item.quantity_available || 0;
            if (available >= 10) inStock++;
            else if (available > 0) lowStock++;
            else outOfStock++;
        });
        
        if (stockDistributionChart) {
            stockDistributionChart.data.datasets[0].data = [inStock, lowStock, outOfStock];
            stockDistributionChart.update();
        }
        
        // Update category chart
        const { data: categories } = await supabaseClient
            .from('categories')
            .select('category_id, category_name');
        
        if (categories && categoryChart) {
            const categoryData = await Promise.all(categories.map(async (cat) => {
                const { data: products } = await supabaseClient
                    .from('products')
                    .select(`
                        unit_price,
                        inventory:inventory_stock(quantity_on_hand)
                    `)
                    .eq('category_id', cat.category_id);
                
                const totalValue = products?.reduce((sum, p) => {
                    return sum + ((p.unit_price || 0) * (p.inventory?.[0]?.quantity_on_hand || 0));
                }, 0) || 0;
                
                return {
                    name: cat.category_name,
                    value: totalValue
                };
            }));
            
            categoryData.sort((a, b) => b.value - a.value);
            const top5 = categoryData.slice(0, 5);
            
            categoryChart.data.labels = top5.map(c => c.name);
            categoryChart.data.datasets[0].data = top5.map(c => c.value);
            categoryChart.update();
        }
        
        // Simulate sales trend (since we don't have historical sales data yet)
        if (salesTrendChart) {
            const simulatedData = Array.from({ length: 12 }, () => 
                Math.floor(Math.random() * 50000) + 10000
            );
            salesTrendChart.data.datasets[0].data = simulatedData;
            salesTrendChart.update();
        }
        
    } catch (error) {
        console.error('Error updating charts:', error);
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
                loadLowStockAlerts();
            }
        )
        .subscribe();
}

// Helper: Animate number values
function animateValue(id, start, end, duration, isCurrency = false) {
    const element = document.getElementById(id);
    if (!element) return;
    
    const range = end - start;
    const increment = range / (duration / 16);
    let current = start;
    
    const timer = setInterval(() => {
        current += increment;
        if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
            current = end;
            clearInterval(timer);
        }
        
        if (isCurrency) {
            element.textContent = formatCurrency(Math.round(current));
        } else {
            element.textContent = Math.round(current);
        }
    }, 16);
}

// Helper: Get time ago
function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    const intervals = {
        year: 31536000,
        month: 2592000,
        week: 604800,
        day: 86400,
        hour: 3600,
        minute: 60
    };
    
    for (const [unit, secondsInUnit] of Object.entries(intervals)) {
        const interval = Math.floor(seconds / secondsInUnit);
        if (interval >= 1) {
            return `${interval} ${unit}${interval !== 1 ? 's' : ''} ago`;
        }
    }
    
    return 'just now';
}

// Helper: Format currency
function formatCurrency(value) {
    return '₱' + value.toLocaleString('en-PH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

// Helper: Show error message
function showError(message) {
    console.error(message);
    // You can implement a toast notification here
}