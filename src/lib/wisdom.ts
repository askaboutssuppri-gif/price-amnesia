/* Echo's wisdom notes + jokes — rotated daily, shuffled on demand.
   Wisdom is real money/grocery craft; jokes are clean grocery humor. */

export const WISDOM: string[] = [
  'The most expensive grocery is the one you throw away. Buy what future-you will actually cook.',
  'A price you have seen twice is a price you can judge. The first sighting is just a rumor.',
  'Stock up when it is cheap, not when you run out. Running out is the most expensive shopping strategy.',
  'Your average is your anchor. Any price under it is a win; any price over it needs a reason.',
  'Stores put the priciest version at eye level. The deals live high, low, and at the ends of the aisle.',
  'Frozen vegetables are last week\'s fresh vegetables with better timing. The savings are real.',
  'Unit price is the truth; shelf price is the costume. Always check the cost per ounce.',
  'A list is a decision you made calmly, at home. The store is designed to unmake it. Trust the calm version of you.',
  'Brand names charge rent for their logo. Store brands often pay the same factory without the logo tax.',
  'Buy the loss leader, leave the theater. The $2 rotisserie chicken is bait for a $60 cart.',
  'Eggs, milk, bread, bananas — know these four prices cold and you can smell a good store in one aisle.',
  'Saving 15% on food you love beats saving 50% on food you tolerate.',
  'The freezer is a time machine for prices. Every deal you freeze is a price increase you refuse.',
  'Small leaks sink grocery budgets: the daily snack, the duplicate spice, the sauce you already own.',
  'Cook once, eat twice. The second meal is the cheapest one you will ever buy.',
  'Markups hide in convenience: pre-cut, pre-washed, pre-portioned. You are paying for someone else\'s ten minutes.',
  'A calm shopper with a memory beats a coupon clipper with a folder. You are building the memory.',
  'When a price drops 20% or more on a staple, that is not shopping — that is investing with a pantry.',
  'Never shop hungry. Hunger negotiates against you and it always wins.',
  'The receipt is the report card of every promise the store made you. Read it like one.',
  'Prices creep quietly, a few cents at a time. Quiet things are exactly what a memory is for.',
  'Your future self eats what your present self buys. Shop like you are feeding someone you love — you are.',
];

export const JOKES: string[] = [
  'Why did the grocery shopper bring a ladder? The prices were through the roof, so she figured she\'d meet them halfway.',
  'I told my wallet we were just going in for milk. It\'s still laughing.',
  'Why don\'t eggs tell jokes? They\'d crack each other up — and at these prices, nobody can afford that.',
  'My grocery list and I have an understanding: I write it, the store ignores it, and we both pretend the cookies were planned.',
  'Why did the banana go to the doctor? It wasn\'t peeling well — and it heard healthcare was cheaper than groceries this month.',
  'I\'m not saying milk is expensive, but the cow just asked for a raise.',
  'Why did the shopper take a pencil to the store? To draw her own conclusions about the "sale" prices.',
  'Lettuce romaine calm — these prices will drop again. They always do. I keep receipts.',
  'Why did the tomato blush? It saw the salad dressing — full price, no coupon, living large.',
  'My budget and I went to the store together. Only one of us came back.',
  'Why are grocery carts so optimistic? Every single one believes today is the day you only buy what\'s on the list.',
  'I asked the bread if it was on sale. It said, "I\'m the yeast of your problems." Rye humor, that one.',
  'Why did the coffee file a complaint? It got mugged — then charged $7 for the experience.',
  'Cheese prices are getting grate. I camembert it. Okay, that one was a stretch — like mozzarella.',
  'Why don\'t secrets last at the grocery store? The beans spill, the lettuce leaks, and the eggs always crack.',
  'I went to buy one onion and came home with a personality: "person who owns a fondue set now."',
  'Why did the potato sit down in the aisle? The price of chips had it mashed emotionally.',
  'Avocado prices are the pits. Literally the only part of that sentence that isn\'t a pun is "prices."',
  'Why did the shopper stare at the orange juice for an hour? The carton said "concentrate."',
  'I\'m on a seafood diet — I see food on sale, I buy it. That\'s not a diet, that\'s a strategy.',
];

/** Deterministic daily pick — same all day (the USER's local day,
   not UTC), new tomorrow. */
export function dailyPick<T>(arr: T[], salt = 0, date = new Date()): T {
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 864e5);
  return arr[(day + salt) % arr.length];
}
export function randomPick<T>(arr: T[], except?: T): T {
  if (arr.length <= 1) return arr[0];
  let v = arr[Math.floor(Math.random() * arr.length)];
  if (except !== undefined && v === except) v = arr[(arr.indexOf(v) + 1) % arr.length];
  return v;
}
