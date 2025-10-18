let currentEditingProductId = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication
    const session = await window.authHelpers.requireAuth();
    if (!session) return;
    
    // Load initial data
    await loadCategories();
    await loadInventory();
    
    // Set up event listeners
    setupEventListeners();
    
    // Set up real-time subscriptions
    setupRealtimeSubscriptions();
});

// Load categories for filter and form
async function loadCategories() {
    try {
        const { data: categories } = await supabase
            .from('categories')
            .select('*')
            .order('category_name');
        
        const categoryFilter = document.getElementById('category-filter');
        const productCategory = document.getElementById('product-category');
        
        categories?.forEach(cat => {
            const option1 = new Option(cat.category_name, cat.category_id);
            const option2 = new Option(cat.category_name, cat.category_id);
            categoryFilter.add(option1);
            productCategory.add(option2);
        });
        
    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

// Load inventory items
async function loadInventory(filters = {}) {
    try {
        console.log('Starting inventory load...');
        let query = supabase
            .from('products')
            .select('*')
            .order('product_name');
        
        // Apply filters
        if (filters.category) {
            query = query.eq('category_id', filters.category);
        }
        
        if (filters.search) {
            query = query.or(`product_name.ilike.%${filters.search}%,sku.ilike.%${filters.search}%`);
        }
        
        console.log('Executing query...');
        const { data: products, error } = await query;
        
        if (error) {
            console.error('Supabase Query Error:', error);
            throw error;
        }
        
        console.log('Query results:', products);
        
        // Apply status filter
        let filteredProducts = products || [];
        if (filters.status) {
            filteredProducts = filteredProducts.filter(p => {
                const qty = p.inventory?.[0]?.quantity_available || 0;
                if (filters.status === 'in_stock') return qty >= 10;
                if (filters.status === 'low_stock') return qty > 0 && qty < 10;
                if (filters.status === 'out_of_stock') return qty === 0;
                return true;
            });
        }
        
        // Update UI
        displayInventory(filteredProducts);
        document.getElementById('inventory-count').textContent = 
            `${filteredProducts.length} items in inventory`;
        
    } catch (error) {
        console.error('Error loading inventory:', error);
    }
}

// Display inventory in table
function displayInventory(products) {
    const tbody = document.getElementById('inventory-table-body');
    
    if (!products || products.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    No products found
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = products.map(product => {
        const inventory = product.inventory?.[0] || {};
        const quantity = inventory.quantity_available || 0;
        const totalValue = quantity * (product.unit_price || 0);
        
        // Determine status
        let status = 'out_of_stock';
        let statusClass = 'status-out';
        let statusText = 'Out of Stock';
        
        if (quantity >= 10) {
            status = 'in_stock';
            statusClass = 'status-in';
            statusText = 'In Stock';
        } else if (quantity > 0) {
            status = 'low_stock';
            statusClass = 'status-low';
            statusText = 'Low Stock';
        }
        
        const lastUpdated = product.updated_at ? 
            new Date(product.updated_at).toLocaleDateString() : 'N/A';
        
        return `
            <tr data-product-id="${product.product_id}">
                <td>${product.product_name}</td>
                <td>${product.sku || 'N/A'}</td>
                <td>${product.category?.category_name || 'Uncategorized'}</td>
                <td>${quantity}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>${formatCurrency(product.unit_price || 0)}</td>
                <td>${formatCurrency(totalValue)}</td>
                <td>${lastUpdated}</td>
                <td>
                    <div class="action-btns">
                        <button class="icon-btn edit-btn" data-id="${product.product_id}">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="icon-btn delete delete-btn" data-id="${product.product_id}">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    
    // Add event listeners to action buttons
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', () => editProduct(btn.dataset.id));
    });
    
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteProduct(btn.dataset.id));
    });
}

// Set up event listeners
function setupEventListeners() {
    // Search
    document.getElementById('inventory-search').addEventListener('input', (e) => {
        const filters = getFilters();
        filters.search = e.target.value;
        loadInventory(filters);
    });
    
    // Category filter
    document.getElementById('category-filter').addEventListener('change', (e) => {
        const filters = getFilters();
        filters.category = e.target.value;
        loadInventory(filters);
    });
    
    // Status filter
    document.getElementById('status-filter').addEventListener('change', (e) => {
        const filters = getFilters();
        filters.status = e.target.value;
        loadInventory(filters);
    });
    
    // Product form submission
    document.getElementById('product-form').addEventListener('submit', saveProduct);
    
    // Add item button
    document.getElementById('add-item-btn').addEventListener('click', () => {
        currentEditingProductId = null;
        document.getElementById('modal-title').textContent = 'Add New Product';
        document.getElementById('product-form').reset();
        document.getElementById('product-modal').classList.add('active');
    });

    // Close modal button
    document.getElementById('close-product-modal').addEventListener('click', () => {
        document.getElementById('product-modal').classList.remove('active');
    });

    // Cancel button
    document.getElementById('cancel-product-btn').addEventListener('click', () => {
        document.getElementById('product-modal').classList.remove('active');
    });
}

// Get current filters
function getFilters() {
    return {
        search: document.getElementById('inventory-search').value,
        category: document.getElementById('category-filter').value,
        status: document.getElementById('status-filter').value
    };
}

// Save product (create or update)
async function saveProduct(e) {
    e.preventDefault();
    
    const productData = {
        product_name: document.getElementById('product-name').value,
        sku: document.getElementById('product-sku').value,
        category_id: document.getElementById('product-category').value,
        unit_price: parseFloat(document.getElementById('product-price').value),
        description: document.getElementById('product-description').value
    };
    
    const quantity = parseInt(document.getElementById('product-quantity').value);
    const minStock = parseInt(document.getElementById('product-min-stock').value);
    
    try {
        let productId;
        
        if (currentEditingProductId) {
            // Update existing product
            const { error } = await supabaseClient
                .from('products')
                .update(productData)
                .eq('product_id', currentEditingProductId);
            
            if (error) throw error;
            productId = currentEditingProductId;
            
        } else {
            // Create new product
            const { data, error } = await supabaseClient
                .from('products')
                .insert([productData])
                .select()
                .single();
            
            if (error) throw error;
            productId = data.product_id;
            
            // Create inventory stock record
            await supabaseClient
                .from('inventory_stock')
                .insert([{
                    product_id: productId,
                    quantity_on_hand: quantity,
                    quantity_available: quantity,
                    quantity_reserved: 0,
                    last_restock_date: new Date().toISOString()
                }]);
            
            // Create initial stock movement
            await supabaseClient
                .from('stock_movements')
                .insert([{
                    product_id: productId,
                    movement_type: 'inbound',
                    quantity_change: quantity,
                    quantity_after: quantity,
                    notes: 'Initial stock'
                }]);
        }
        
        // Close modal and reload
        document.getElementById('product-modal').classList.remove('active');
        await loadInventory(getFilters());
        
        alert(currentEditingProductId ? 'Product updated successfully!' : 'Product added successfully!');
        
    } catch (error) {
        console.error('Error saving product:', error);
        alert('Error saving product: ' + error.message);
    }
}

// Edit product
async function editProduct(productId) {
    try {
        const { data: product } = await supabaseClient
            .from('products')
            .select(`
                *,
                inventory:inventory_stock(quantity_on_hand)
            `)
            .eq('product_id', productId)
            .single();
        
        if (!product) throw new Error('Product not found');
        
        currentEditingProductId = productId;
        document.getElementById('modal-title').textContent = 'Edit Product';
        
        // Fill form
        document.getElementById('product-name').value = product.product_name;
        document.getElementById('product-sku').value = product.sku || '';
        document.getElementById('product-category').value = product.category_id;
        document.getElementById('product-quantity').value = product.inventory?.[0]?.quantity_on_hand || 0;
        document.getElementById('product-price').value = product.unit_price;
        document.getElementById('product-min-stock').value = 10; // Default
        document.getElementById('product-description').value = product.description || '';
        
        document.getElementById('product-modal').classList.add('active');
        
    } catch (error) {
        console.error('Error loading product:', error);
        alert('Error loading product: ' + error.message);
    }
}

// Delete product
async function deleteProduct(productId) {
    if (!confirm('Are you sure you want to delete this product?')) return;
    
    try {
        const { error } = await supabaseClient
            .from('products')
            .delete()
            .eq('product_id', productId);
        
        if (error) throw error;
        
        await loadInventory(getFilters());
        alert('Product deleted successfully!');
        
    } catch (error) {
        console.error('Error deleting product:', error);
        alert('Error deleting product: ' + error.message);
    }
}

// Set up real-time subscriptions
function setupRealtimeSubscriptions() {
    supabaseClient
        .channel('products_changes')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'products' },
            () => loadInventory(getFilters())
        )
        .subscribe();
    
    supabaseClient
        .channel('inventory_changes')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'inventory_stock' },
            () => loadInventory(getFilters())
        )
        .subscribe();
}