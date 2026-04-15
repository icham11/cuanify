import dotenv from 'dotenv';
import { getShippingQuote, createShippingResi } from '../lib/bookings/shipping-service';

dotenv.config();

async function createRealOrder() {
  console.log('--- CREATING REAL TEST ORDER (LIVE) ---');
  
  const testPayload = {
    items: [
      {
        productName: 'Test Cake (Automated)',
        category: 'Cake',
        subcategory: 'Classic',
        size: '16cm',
        quantity: 1
      }
    ],
    destinationAddress: 'Grand Indonesia Mall, Menteng, Jakarta Pusat',
    destinationPostalCode: '10310',
    customerName: 'Wahid (Test Bot)',
    customerPhone: '08123456789',
    deliveryDate: new Date().toISOString().split('T')[0], // Today
    deliveryTime: '09:00',
    referenceId: `TEST-${Date.now().toString().slice(-6)}`
  };

  try {
    console.log('Step 1: Fetching Quotes...');
    const quoteResult = await getShippingQuote({
      items: testPayload.items,
      destinationAddress: testPayload.destinationAddress,
      destinationPostalCode: testPayload.destinationPostalCode
    });

    if (!quoteResult.success || quoteResult.quotes.length === 0) {
      throw new Error('No quotes found.');
    }

    // Find the cheapest courier to minimize cost
    const cheapestQuote = quoteResult.quotes.reduce((prev, curr) => 
      prev.price < curr.price ? prev : curr
    );

    console.log(`Step 2: Selected cheapest courier: [${cheapestQuote.provider}] ${cheapestQuote.courierServiceName} - Rp${cheapestQuote.price}`);

    console.log('Step 3: Creating Real Resi/Order at Biteship...');
    const resiResult = await createShippingResi({
      ...testPayload,
      bookingCode: testPayload.referenceId,
      selectedQuote: cheapestQuote
    });

    if (resiResult.success && resiResult.shipment) {
      console.log('\n✅ SUCCESS! Order created.');
      console.log('Order ID:', resiResult.shipment.externalOrderId);
      console.log('Tracking Number:', resiResult.shipment.trackingNumber);
      console.log('Courier:', resiResult.shipment.courierServiceName);
      console.log('Status:', resiResult.shipment.status);
    } else {
      console.error('\n❌ FAILED to create resi:', JSON.stringify(resiResult, null, 2));
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
  }
}

createRealOrder();
