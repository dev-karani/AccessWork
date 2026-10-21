export interface PhraseGroup {
  id: string
  label: string
  phrases: string[]
}

/** Quick replies for the Deaf receptionist, grouped by common hospitality exchanges. */
export const PHRASE_GROUPS: PhraseGroup[] = [
  {
    id: 'greet',
    label: 'Greeting',
    phrases: [
      'Welcome! How can I help you?',
      'Good morning, welcome to our hotel.',
      'I am Deaf. I will reply on this screen, please speak normally.',
      'Please wait a moment.',
    ],
  },
  {
    id: 'checkin',
    label: 'Check-in',
    phrases: [
      'Yes, I can see your reservation.',
      'May I see your ID or passport, please?',
      'Thank you. Your room is ready.',
      'Your room is 204, on the second floor.',
      'Here is your room key.',
      'Check-out is at 10 AM.',
    ],
  },
  {
    id: 'food',
    label: 'Breakfast & dining',
    phrases: [
      'Breakfast is served from 6:30 to 10:00 AM.',
      'The restaurant is on the ground floor, to your left.',
      'Breakfast is included in your booking.',
      'Room service is available until 11 PM.',
    ],
  },
  {
    id: 'directions',
    label: 'Directions',
    phrases: [
      'The lift is on your left.',
      'The restroom is on your right.',
      'The swimming pool is behind the main building.',
      'I can call a taxi for you.',
    ],
  },
  {
    id: 'payment',
    label: 'Payment',
    phrases: [
      'The total is 12,000 shillings per night.',
      'You can pay by card or M-Pesa.',
      'Here is your receipt.',
    ],
  },
  {
    id: 'general',
    label: 'General',
    phrases: [
      'The Wi-Fi password is on your key card.',
      'Is there anything else I can help with?',
      'Sorry, could you say that again?',
      'Enjoy your stay!',
    ],
  },
]

/** Sample guest lines for rehearsing the demo when a microphone is not available. */
export const SAMPLE_GUEST_LINES = [
  'Hello, I have a reservation under James Mwangi. Can I check in?',
  'Thank you. What time is breakfast?',
  'Where is the lift?',
  'Can I pay with M-Pesa?',
  'Thank you, goodbye!',
]
