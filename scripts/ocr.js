document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication
    const session = await window.authHelpers.requireAuth();
    if (!session) return;
    
    // Load processing history
    await loadProcessingHistory();
    
    // Set up event listeners
    setupEventListeners();
});

// Set up event listeners
function setupEventListeners() {
    const processBtn = document.getElementById('process-receipt-btn');
    
    processBtn.addEventListener('click', async () => {
        const selectedFile = window.selectedReceiptFile;
        
        if (!selectedFile) {
            alert('Please select a file first');
            return;
        }
        
        // Show receipt type dialog
        showReceiptTypeDialog();
    });
}

// Show receipt type dialog
function showReceiptTypeDialog() {
    const dialog = document.createElement('div');
    dialog.className = 'modal active';
    dialog.innerHTML = `
        <div class="modal-content" style="max-width: 400px;">
            <div class="modal-header">
                <h2>Select Receipt Type</h2>
                <button class="modal-close" onclick="this.closest('.modal').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div style="padding: 24px;">
                <p style="margin-bottom: 20px; color: var(--text-secondary);">
                    Is this receipt from a supplier (stock in) or a customer (stock out)?
                </p>
                <div style="display: grid; gap: 12px;">
                    <button class="btn btn-primary" onclick="processReceipt('inbound')" style="justify-content: center;">
                        <i class="fas fa-arrow-down"></i>
                        Supplier Receipt (Stock In)
                    </button>
                    <button class="btn btn-primary" onclick="processReceipt('outbound')" style="justify-content: center; background: var(--danger);">
                        <i class="fas fa-arrow-up"></i>
                        Customer Receipt (Stock Out)
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);
}

// Process receipt with Tesseract.js
window.processReceipt = async function(receiptType) {
    // Close dialog
    document.querySelector('.modal')?.remove();
    
    const selectedFile = window.selectedReceiptFile;
    if (!selectedFile) return;
    
    // Show loading state
    const processBtn = document.getElementById('process-receipt-btn');
    const originalText = processBtn.innerHTML;
    processBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    processBtn.disabled = true;
    
    try {
        // Convert image to data URL
        const imageDataUrl = await fileToDataURL(selectedFile);
        
        // Show progress dialog
        const progressDialog = showProgressDialog();
        
        // Process with Tesseract.js
        const result = await Tesseract.recognize(
            imageDataUrl,
            'eng',
            {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        updateProgress(progressDialog, Math.round(m.progress * 100));
                    }
                }
            }
        );
        
        // Close progress dialog
        progressDialog.remove();
        
        // Extract text
        const extractedText = result.data.text;
        console.log('Extracted text:', extractedText);
        
        // Parse receipt data
        const extractedData = parseReceiptText(extractedText);
        
        // Save receipt image to Supabase Storage
        const imageUrl = await uploadReceiptImage(selectedFile);
        
        // Save to database
        const receiptId = await saveReceiptToDatabase(selectedFile.name, imageUrl, extractedData, receiptType);
        
        // Show confirmation dialog
        showConfirmationDialog(receiptId, extractedData, receiptType);
        
        // Clear selected file
        window.selectedReceiptFile = null;
        document.getElementById('selected-file-info').style.display = 'none';
        document.getElementById('receipt-file-input').value = '';
        
    } catch (error) {
        console.error('Error processing receipt:', error);
        alert('Error processing receipt: ' + error.message);
    } finally {
        processBtn.innerHTML = originalText;
        processBtn.disabled = false;
    }
};

// Show progress dialog
function showProgressDialog() {
    const dialog = document.createElement('div');
    dialog.className = 'modal active';
    dialog.innerHTML = `
        <div class="modal-content" style="max-width: 400px;">
            <div style="padding: 40px; text-align: center;">
                <i class="fas fa-scanner" style="font-size: 48px; color: var(--primary-color); margin-bottom: 20px;"></i>
                <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Processing Receipt</h3>
                <p style="color: var(--text-secondary); margin-bottom: 20px;">Extracting text from image...</p>
                <div style="width: 100%; height: 8px; background: var(--bg-light); border-radius: 4px; overflow: hidden;">
                    <div id="progress-bar" style="height: 100%; background: var(--primary-color); width: 0%; transition: width 0.3s;"></div>
                </div>
                <p id="progress-text" style="margin-top: 12px; font-size: 14px; color: var(--text-secondary);">0%</p>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);
    return dialog;
}

// Update progress
function updateProgress(dialog, percent) {
    const progressBar = dialog.querySelector('#progress-bar');
    const progressText = dialog.querySelector('#progress-text');
    if (progressBar) progressBar.style.width = `${percent}%`;
    if (progressText) progressText.textContent = `${percent}%`;
}

// Convert file to data URL
function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Parse receipt text to extract structured data
function parseReceiptText(text) {
    const lines = text.split('\n').filter(line => line.trim());
    
    const items = [];
    let totalAmount = 0;
    let receiptDate = null;
    let storeName = '';
    
    // Regex patterns
    const pricePattern = /\$?\s*(\d+\.?\d{0,2})/g;
    const datePattern = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})|(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/;
    const totalPattern = /total|amount due|balance/i;
    
    // Try to find store name (usually first few lines)
    if (lines.length > 0) {
        storeName = lines[0].trim();
    }
    
    // Try to find date
    for (const line of lines) {
        const dateMatch = line.match(datePattern);
        if (dateMatch) {
            receiptDate = dateMatch[0];
            break;
        }
    }
    
    // Extract items and prices
    let foundTotal = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Skip empty lines
        if (!line) continue;
        
        // Check if this is the total line
        if (totalPattern.test(line)) {
            foundTotal = true;
            const prices = line.match(pricePattern);
            if (prices && prices.length > 0) {
                const lastPrice = prices[prices.length - 1].replace(/[$\s]/g, '');
                totalAmount = parseFloat(lastPrice);
            }
            break;
        }
        
        // Skip header/footer lines
        if (line.toLowerCase().includes('receipt') || 
            line.toLowerCase().includes('thank you') ||
            line.toLowerCase().includes('welcome') ||
            line.length < 3) {
            continue;
        }
        
        // Try to extract item and price
        const prices = [...line.matchAll(pricePattern)];
        if (prices.length > 0) {
            // Get the last price in the line (usually unit price or total)
            const lastPriceMatch = prices[prices.length - 1];
            const price = parseFloat(lastPriceMatch[1]);
            
            // Extract item name (everything before the price)
            let itemName = line.substring(0, lastPriceMatch.index).trim();
            
            // Try to find quantity (common patterns: "2x", "2 x", "QTY 2")
            let quantity = 1;
            const qtyMatch = itemName.match(/(\d+)\s*[xX]|QTY\s*(\d+)/i);
            if (qtyMatch) {
                quantity = parseInt(qtyMatch[1] || qtyMatch[2]);
                itemName = itemName.replace(/(\d+)\s*[xX]|QTY\s*(\d+)/i, '').trim();
            }
            
            // Only add if item name exists and price is valid
            if (itemName && price > 0 && itemName.length > 2) {
                items.push({
                    name: itemName,
                    quantity: quantity,
                    price: price / quantity // Unit price
                });
            }
        }
    }
    
    // If no total found, calculate from items
    if (totalAmount === 0 && items.length > 0) {
        totalAmount = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    }
    
    return {
        storeName,
        items,
        totalAmount,
        receiptDate: receiptDate || new Date().toISOString().split('T')[0],
        rawText: text
    };
}

// Upload receipt image to Supabase Storage
async function uploadReceiptImage(file) {
    try {
        const fileName = `receipt_${Date.now()}_${file.name}`;
        const { data, error } = await supabaseClient.storage
            .from('receipts')
            .upload(fileName, file);
        
        if (error) throw error;
        
        // Get public URL
        const { data: urlData } = supabaseClient.storage
            .from('receipts')
            .getPublicUrl(fileName);
        
        return urlData.publicUrl;
        
    } catch (error) {
        console.error('Error uploading image:', error);
        // Return null if storage fails, we can still save the receipt data
        return null;
    }
}

// Save receipt to database
async function saveReceiptToDatabase(fileName, imageUrl, extractedData, receiptType) {
    const user = await window.authHelpers.getCurrentUser();
    
    // Insert receipt image record
    const { data: receipt, error: receiptError } = await supabaseClient
        .from('receipt_images')
        .insert([{
            image_path: imageUrl,
            upload_date: new Date().toISOString(),
            processed_by: user.id
        }])
        .select()
        .single();
    
    if (receiptError) throw receiptError;
    
    // Insert OCR extracted data
    const { error: ocrError } = await supabaseClient
        .from('ocr_extracted_data')
        .insert([{
            receipt_image_id: receipt.receipt_image_id,
            extracted_json: extractedData,
            confidence_score: 0.80, // Tesseract confidence
            extraction_date: new Date().toISOString()
        }]);
    
    if (ocrError) throw ocrError;
    
    return receipt.receipt_image_id;
}

// Show confirmation dialog
function showConfirmationDialog(receiptId, extractedData, receiptType) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 700px; max-height: 90vh; overflow-y: auto;">
            <div class="modal-header">
                <h2>Confirm Receipt Data</h2>
                <button class="modal-close" onclick="this.closest('.modal').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div style="padding: 24px;">
                <div style="background: var(--bg-light); padding: 16px; border-radius: 8px; margin-bottom: 20px;">
                    ${extractedData.storeName ? `
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <strong>Store:</strong>
                        <span>${extractedData.storeName}</span>
                    </div>
                    ` : ''}
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <strong>Receipt Type:</strong>
                        <span style="color: ${receiptType === 'inbound' ? 'var(--success)' : 'var(--danger)'}">
                            ${receiptType === 'inbound' ? 'Stock In (Supplier)' : 'Stock Out (Customer)'}
                        </span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <strong>Date:</strong>
                        <span>${extractedData.receiptDate}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <strong>Total Amount:</strong>
                        <span style="font-size: 18px; font-weight: 600;">₱${extractedData.totalAmount.toFixed(2)}</span>
                    </div>
                </div>
                
                <h3 style="font-size: 14px; font-weight: 600; margin-bottom: 12px;">
                    Items Detected (${extractedData.items.length}):
                    <span style="font-size: 12px; font-weight: normal; color: var(--text-secondary); margin-left: 8px;">
                        Review and edit if needed
                    </span>
                </h3>
                
                ${extractedData.items.length === 0 ? `
                    <div style="padding: 40px; text-align: center; color: var(--text-secondary); border: 1px solid var(--border-color); border-radius: 6px;">
                        <i class="fas fa-inbox" style="font-size: 48px; margin-bottom: 12px; opacity: 0.5;"></i>
                        <p>No items detected. The image quality might be poor.</p>
                        <button class="btn" onclick="this.closest('.modal').remove()" style="margin-top: 16px;">Try Another Image</button>
                    </div>
                ` : `
                    <div style="max-height: 400px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 6px;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead style="background: var(--bg-light); position: sticky; top: 0; z-index: 1;">
                                <tr>
                                    <th style="padding: 10px; text-align: left; font-size: 12px; font-weight: 600;">Item Name</th>
                                    <th style="padding: 10px; text-align: center; font-size: 12px; font-weight: 600; width: 100px;">Qty</th>
                                    <th style="padding: 10px; text-align: right; font-size: 12px; font-weight: 600; width: 120px;">Unit Price</th>
                                    <th style="padding: 10px; text-align: right; font-size: 12px; font-weight: 600; width: 120px;">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${extractedData.items.map((item, index) => `
                                    <tr style="border-bottom: 1px solid var(--border-color);">
                                        <td style="padding: 10px;">
                                            <input type="text" value="${item.name}" 
                                                id="item-name-${index}"
                                                style="width: 100%; padding: 6px; border: 1px solid var(--border-color); border-radius: 4px; font-size: 13px;">
                                        </td>
                                        <td style="padding: 10px; text-align: center;">
                                            <input type="number" value="${item.quantity}" 
                                                id="item-qty-${index}"
                                                min="1"
                                                onchange="updateItemTotal(${index})"
                                                style="width: 70px; padding: 6px; border: 1px solid var(--border-color); border-radius: 4px; text-align: center; font-size: 13px;">
                                        </td>
                                        <td style="padding: 10px; text-align: right;">
                                            <input type="number" value="${item.price.toFixed(2)}" 
                                                id="item-price-${index}"
                                                step="0.01"
                                                min="0"
                                                onchange="updateItemTotal(${index})"
                                                style="width: 100px; padding: 6px; border: 1px solid var(--border-color); border-radius: 4px; text-align: right; font-size: 13px;">
                                        </td>
                                        <td style="padding: 10px; text-align: right;">
                                            <span id="item-total-${index}" style="font-weight: 500;">₱${(item.quantity * item.price).toFixed(2)}</span>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    
                    <div style="display: flex; gap: 12px; margin-top: 24px; justify-content: flex-end;">
                        <button class="btn" onclick="this.closest('.modal').remove()">Cancel</button>
                        <button class="btn btn-primary" onclick="confirmAndUpdateInventory(${receiptId}, ${extractedData.items.length}, '${receiptType}')">
                            <i class="fas fa-check"></i>
                            Confirm & Update Inventory
                        </button>
                    </div>
                `}
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// Update item total
window.updateItemTotal = function(index) {
    const qty = parseFloat(document.getElementById(`item-qty-${index}`).value) || 0;
    const price = parseFloat(document.getElementById(`item-price-${index}`).value) || 0;
    const total = qty * price;
    document.getElementById(`item-total-${index}`).textContent = `$${total.toFixed(2)}`;
};

// Confirm and update inventory
window.confirmAndUpdateInventory = async function(receiptId, itemCount, receiptType) {
    const modal = document.querySelector('.modal');
    
    try {
        window.utils.showLoading();
        
        // Collect updated item data
        const items = [];
        for (let i = 0; i < itemCount; i++) {
            const name = document.getElementById(`item-name-${i}`).value.trim();
            const quantity = parseInt(document.getElementById(`item-qty-${i}`).value);
            const price = parseFloat(document.getElementById(`item-price-${i}`).value);
            
            if (name && quantity > 0 && price >= 0) {
                items.push({ name, quantity, price });
            }
        }
        
        if (items.length === 0) {
            throw new Error('No valid items to process');
        }
        
        // Process each item
        for (const item of items) {
            await processInventoryItem(item, receiptType, receiptId);
        }
        
        window.utils.hideLoading();
        
        // Close modal
        modal.remove();
        
        // Reload history
        await loadProcessingHistory();
        
        window.utils.showToast(`Successfully processed ${items.length} items!`, 'success');
        
    } catch (error) {
        window.utils.hideLoading();
        console.error('Error updating inventory:', error);
        alert('Error updating inventory: ' + error.message);
    }
};

// Process individual inventory item
async function processInventoryItem(item, receiptType, receiptId) {
    const user = await window.authHelpers.getCurrentUser();
    
    // Search for existing product by name (case-insensitive, partial match)
    const { data: existingProducts } = await supabaseClient
        .from('products')
        .select('product_id, unit_price, product_name')
        .ilike('product_name', `%${item.name}%`)
        .limit(5);
    
    let productId;
    let isNewProduct = false;
    
    // Find best match
    let bestMatch = null;
    if (existingProducts && existingProducts.length > 0) {
        // Simple fuzzy matching - find closest name
        bestMatch = existingProducts[0];
        for (const product of existingProducts) {
            if (product.product_name.toLowerCase() === item.name.toLowerCase()) {
                bestMatch = product;
                break;
            }
        }
    }
    
    if (bestMatch) {
        // Use existing product
        productId = bestMatch.product_id;
        
        // Update price if different
        if (Math.abs(bestMatch.unit_price - item.price) > 0.01) {
            await supabaseClient
                .from('products')
                .update({ unit_price: item.price })
                .eq('product_id', productId);
        }
        
    } else {
        // Create new product
        isNewProduct = true;
        const { data: newProduct, error } = await supabaseClient
            .from('products')
            .insert([{
                product_name: item.name,
                unit_price: item.price,
                sku: `SKU-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
                category_id: null
            }])
            .select()
            .single();
        
        if (error) throw error;
        productId = newProduct.product_id;
        
        // Create inventory stock record
        await supabaseClient
            .from('inventory_stock')
            .insert([{
                product_id: productId,
                quantity_on_hand: 0,
                quantity_available: 0,
                quantity_reserved: 0
            }]);
    }
    
    // Update inventory based on receipt type
    const quantityChange = receiptType === 'inbound' ? item.quantity : -item.quantity;
    
    // Get current stock
    const { data: currentStock } = await supabaseClient
        .from('inventory_stock')
        .select('*')
        .eq('product_id', productId)
        .single();
    
    const newQuantityOnHand = Math.max(0, (currentStock?.quantity_on_hand || 0) + quantityChange);
    const newQuantityAvailable = Math.max(0, (currentStock?.quantity_available || 0) + quantityChange);
    
    // Update inventory stock
    await supabaseClient
        .from('inventory_stock')
        .update({
            quantity_on_hand: newQuantityOnHand,
            quantity_available: newQuantityAvailable,
            last_restock_date: new Date().toISOString()
        })
        .eq('product_id', productId);
    
    // Create stock movement record
    await supabaseClient
        .from('stock_movements')
        .insert([{
            product_id: productId,
            movement_type: receiptType,
            quantity_change: quantityChange,
            quantity_after: newQuantityOnHand,
            reference_type: 'receipt',
            reference_id: receiptId,
            notes: `OCR processed ${receiptType} - ${isNewProduct ? 'New product' : 'Updated stock'}`
        }]);
    
    // Create transaction record
    if (receiptType === 'inbound') {
        await supabaseClient
            .from('inbound_transactions')
            .insert([{
                product_id: productId,
                quantity: item.quantity,
                unit_price: item.price,
                line_total: item.quantity * item.price,
                transaction_date: new Date().toISOString()
            }]);
    }
}

// Load processing history
async function loadProcessingHistory() {
    try {
        const { data: receipts } = await supabaseClient
            .from('receipt_images')
            .select(`
                receipt_image_id,
                image_path,
                upload_date,
                ocr_data:ocr_extracted_data(extracted_json, confidence_score)
            `)
            .order('upload_date', { ascending: false })
            .limit(20);
        
        const container = document.getElementById('receipts-container');
        
        if (!receipts || receipts.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); grid-column: 1/-1; padding: 40px;">No receipts processed yet</p>';
            return;
        }
        
        container.innerHTML = receipts.map(receipt => {
            const uploadDate = new Date(receipt.upload_date).toLocaleString();
            const extractedData = receipt.ocr_data?.[0]?.extracted_json || {};
            const itemCount = extractedData.items?.length || 0;
            const total = extractedData.totalAmount || 0;
            const confidence = receipt.ocr_data?.[0]?.confidence_score || 0;
            
            return `
                <div style="background: var(--bg-white); border: 1px solid var(--border-color); border-radius: 8px; padding: 16px;">
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                        <i class="fas fa-receipt" style="font-size: 24px; color: var(--primary-color);"></i>
                        <div style="flex: 1;">
                            <div style="font-size: 14px; font-weight: 500;">
                                ${extractedData.storeName || `Receipt #${receipt.receipt_image_id}`}
                            </div>
                            <div style="font-size: 12px; color: var(--text-secondary);">${uploadDate}</div>
                        </div>
                        <span class="status-badge status-in">Processed</span>
                    </div>
                    <div style="padding-top: 12px; border-top: 1px solid var(--border-color);">
                        <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px;">
                            <span style="color: var(--text-secondary);">Items:</span>
                            <strong>${itemCount}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px;">
                            <span style="color: var(--text-secondary);">Total:</span>
                            <strong>$${total.toFixed(2)}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 12px;">
                            <span style="color: var(--text-secondary);">Confidence:</span>
                            <span style="color: var(--${confidence >= 0.8 ? 'success' : 'warning'});">${(confidence * 100).toFixed(0)}%</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading processing history:', error);
    }
}