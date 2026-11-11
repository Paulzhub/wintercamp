// Winter Camp 2027: the one place to change camp details.
// Used by the page renderer (Node), the browser code and the tests.
// The Apps Script backend keeps its own copy of the seat limits and dates
// (apps-script/Code.gs, CONFIG) because it runs in Google's servers: keep both in step.

export default {
  site: {
    // Public address of the site, without a trailing slash.
    origin: 'https://paulzhub.github.io',
    // Path the site is served from. '/wintercamp/' for GitHub Pages project sites,
    // '/' if a custom domain is added later.
    basePath: '/wintercamp/',
  },

  camp: {
    name: 'Winter Camp 2027',
    theme: 'Illuminate',
    themeLine: 'Light of the World',
    organiser: "Kid's Happy Club",
  },

  // Age is checked on the first day of that category's camp.
  categories: {
    youth: {
      seats: 30,
      start: '2027-01-04',
      end: '2027-01-06',
      minAge: 10, // inclusive
      maxAge: 18, // inclusive
    },
    kids: {
      seats: 30,
      start: '2027-01-11',
      end: '2027-01-13',
      minAge: 0, // inclusive
      maxAge: 9, // inclusive ("under 10")
    },
  },

  venue: {
    name: 'Snow View Residency',
    street: 'Jogiwara Road',
    locality: 'McLeodganj, Dharamshala',
    region: 'Himachal Pradesh',
    country: 'India',
    countryCode: 'IN',
    postalCode: '176219',
  },

  fee: {
    amount: 500,
    currency: 'INR',
    display: '₹500',
  },

  upi: {
    id: 'achuisr1985.27-1@okhdfcbank',
    payeeName: 'Achui Sareo',
    phone: '8219012669',
    note: 'Winter Camp 2027',
  },

  contact: {
    phoneDisplay: '+91-8219012669',
    phoneHref: 'tel:+918219012669',
  },

  // Paste the Google Apps Script web app URL here after deploying it
  // (see apps-script/README.md). It looks like:
  // https://script.google.com/macros/s/AKfy.../exec
  appsScriptUrl: 'https://script.google.com/macros/s/AKfycbyX6DzCn0fdAUJe7b7yUBI8Zff3EFCEz7LPPzVkene5fKA4JC14OfWAQOOEmKnKuTlO/exec',
};
