import dotenv from 'dotenv';
import { getShippingQuote, getSmartCourierLabel } from '../lib/bookings/shipping-service';

dotenv.config();

async function testLiveBiteship() {
  console.log('--- TESTING BITESHIP LIVE CONNECTION ---');
  console.log('Using API Key starts with:', process.env.BITESHIP_API_KEY?.substring(0, 15), '...');

  const testPayload = {
    items: [
      {
        productName: 'Test Cake',
        category: 'Cake',
        subcategory: 'Classic',
        size: '16cm',
        quantity: 1
      }
    ],
    // Origin is sunter (from .env)
    // Destination: Grand Indonesia (Central Jakarta) to ensure short distance for Instant
    destinationAddress: 'Grand Indonesia, Menteng, Jakarta Pusat',
    destinationPostalCode: '10310'
  };

  try {
    console.log('Fetching quotes for:', testPayload.destinationAddress);
    const result = await getShippingQuote(testPayload);

    if (result.success) {
      console.log('\nSUCCESS! Found', result.quotes.length, 'courier options.');
      console.log('Distance:', result.distanceKm, 'km');
      
      console.log('\nCourier List (Scheduled 2026-04-20):');
      result.quotes.forEach(q => {
        const smartLabel = getSmartCourierLabel({
          courierName: q.courierServiceName,
          deliveryDate: '2026-04-20', 
        });
        console.log(`- [${q.provider}] ${q.courierServiceName} -> Smart Label: ${smartLabel}`);
      });

      console.log('\nCourier List (Today):');
      const today = new Date().toISOString().split('T')[0];
      result.quotes.forEach(q => {
        const smartLabel = getSmartCourierLabel({
          courierName: q.courierServiceName,
          deliveryDate: today, 
        });
        console.log(`- [${q.provider}] ${q.courierServiceName} -> Smart Label: ${smartLabel}`);
      });

      const hasGrab = result.quotes.some(q => q.provider === 'GRAB');
      const hasGojek = result.quotes.some(q => q.provider === 'GOJEK');

      if (hasGrab || hasGojek) {
        console.log('\n✅ VERIFIED: Instant carriers (Grab/Gojek) are now appearing!');
      } else {
        console.log('\n⚠️ WARNING: Only express carriers found. Check if coordinates were resolved or if account supports Instant.');
      }
    } else {
      console.error('\n❌ FAILED:', result.error || result.warning);
    }
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
  }
}

testLiveBiteship();
