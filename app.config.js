import 'dotenv/config';

export default {
  expo: {
    name: 'Digital-Signage-System',
    extra: {
      ORDER_TRACKING_URL: process.env.ORDER_TRACKING_URL,
    },
  },
};
