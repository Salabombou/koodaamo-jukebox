import daisyui from 'daisyui';

export default {
  content: ['./src/client/index.html', './src/client/**/*.{ts,tsx}'],
  theme: {},
  daisyui: {
    themes: ['luxury']
  },
  plugins: [daisyui]
};
