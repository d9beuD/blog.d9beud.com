const colorClasses = ['violet', 'yellow']
const otherClasses = ['hidden', 'overflow-y-hidden', 'h-0']
module.exports = {
    content: [
      './_drafts/**/*.html',
      './_includes/**/*.html',
      './_layouts/**/*.html',
      './_posts/*.md',
      './articles/*.html',
      './*.md',
      './*.html',
    ],
    safelist: [
      ...colorClasses.map((color) => `bg-${color}-50`),
      ...colorClasses.map((color) => `bg-${color}-600`),
      ...colorClasses.map((color) => `border-${color}-50`),
      ...colorClasses.map((color) => `border-${color}-600`),
      ...colorClasses.map((color) => `text-${color}-50`),
      ...colorClasses.map((color) => `text-${color}-600`),

      ...otherClasses,
    ],
    theme: {
      theme: {
        extend: {},
      },
    },
    plugins: []
  }