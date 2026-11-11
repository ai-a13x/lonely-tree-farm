const cards = document.getElementById('listings');
const dialog = document.getElementById('reserve');
const form = document.getElementById('reserve-form');
const done = document.getElementById('reserve-done');
const errorBox = document.getElementById('reserve-error');
const submit = document.getElementById('reserve-submit');
let current = null;

function el(tag, attrs, ...kids) {
  const node = document.createElement(tag);
  Object.assign(node, attrs);
  node.append(...kids);
  return node;
}

function card(l) {
  const soldOut = l.remaining < 1;
  const dl = el('dl');
  const row = (term, value) => dl.append(el('dt', {}, term), el('dd', {}, value));
  if (l.ready) row('Ready', l.ready);
  row('Price', l.price || 'Ask Alex');
  row('Left', soldOut ? 'None' : l.remaining + (l.remaining === 1 ? ' share' : ' shares'));
  const button = el('button', { type: 'button', className: soldOut ? 'btn btn-outline' : 'btn btn-red' }, soldOut ? 'Join the waiting list' : 'Reserve this share');
  button.addEventListener('click', () => openDialog(l));
  return el('article', { className: 'card' },
    el('div', { className: 'card-head' },
      el('h3', {}, l.name),
      el('span', { className: soldOut ? 'status gone' : 'status' }, soldOut ? 'Spoken for' : l.remaining + ' of ' + l.total + ' left')),
    ...(l.blurb ? [el('p', {}, l.blurb)] : []),
    dl,
    button);
}

async function loadListings() {
  try {
    const res = await fetch('/api/listings');
    if (!res.ok) throw new Error(String(res.status));
    const listings = await res.json();
    cards.replaceChildren(...(listings.length ? listings.map(card) : [el('p', { className: 'empty' }, 'Next batch coming soon.')]));
  } catch {
    cards.replaceChildren(el('p', { className: 'empty' }, "We couldn't load what's available. Please refresh in a moment."));
  }
}

function openDialog(l) {
  current = l;
  const soldOut = l.remaining < 1;
  form.reset();
  form.hidden = false;
  done.hidden = true;
  errorBox.textContent = '';
  submit.disabled = false;
  document.getElementById('reserve-title').textContent = (soldOut ? 'Join the waiting list: ' : 'Reserve: ') + l.name;
  document.getElementById('reserve-intro').textContent = soldOut
    ? "This batch is spoken for. Leave your details and Alex will call when the next one is ready."
    : 'Nothing to pay now. Alex will call to agree price, cuts and collection.';
  submit.textContent = soldOut ? 'Join the list' : 'Reserve';
  dialog.showModal();
  document.getElementById('f-name').focus();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  if (!data.name.trim() || !data.phone.trim()) {
    errorBox.textContent = 'Please enter your name and a phone number.';
    (data.name.trim() ? form.phone : form.name).focus();
    return;
  }
  errorBox.textContent = '';
  submit.disabled = true;
  try {
    const res = await fetch('/api/reserve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...data, listing_id: current.id }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'Something went wrong. Please try again.');
    form.hidden = true;
    done.hidden = false;
    const text = document.getElementById('reserve-done-text');
    text.textContent = body.kind === 'waitlist'
      ? "You're on the list. Alex will call when the next batch is ready."
      : "It's held for you. Alex will call you to sort price, cuts and collection.";
    text.focus();
    loadListings();
  } catch (err) {
    errorBox.textContent = err.message;
    submit.disabled = false;
  }
});

document.getElementById('reserve-cancel').addEventListener('click', () => dialog.close());
document.getElementById('reserve-close').addEventListener('click', () => dialog.close());

loadListings();
