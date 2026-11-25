-- Sample data for SPC Canteen.
-- Paste into SQL Editor and Run. Safe to re-run (matched by code/name).

-- Departments offered at the college ----------------------------------------
insert into public.departments (code, name) values
  ('ED',   'College of Education'),
  ('CRIM', 'College of Criminology'),
  ('CAS',  'College of Arts and Sciences'),
  ('CCS',  'College of Computer Studies'),
  ('CBA',  'College of Business Administration'),
  ('ENG',  'College of Engineering')
on conflict (code) do nothing;

-- Master menu. Staff set each day's availability on the daily board. ---------
insert into public.menu_items (name, description, category, price, emoji, available, stock)
values
  ('Chicken Adobo', 'A classic, with rice and a little extra sauce.', 'Main', 65.00, '🍗', true, 40),
  ('Pork Sinigang', 'Tamarind soup with vegetables and rice.', 'Main', 70.00, '🍲', true, 30),
  ('Tinola', 'Ginger chicken soup with green papaya.', 'Main', 65.00, '🥣', true, 30),
  ('Eggplant Omelette', 'Soft egg with eggplant and rice.', 'Main', 55.00, '🍳', true, 25),
  ('Spaghetti', 'Sweet-sauce spaghetti with a bun.', 'Main', 60.00, '🍝', true, 35),
  ('Pandesal with Jam', 'Two pieces, spread with strawberry jam.', 'Snack', 25.00, '🥪', true, 50),
  ('Banana Que', 'Grilled banana on a stick.', 'Snack', 20.00, '🍌', true, 40),
  ('Iced Tea', 'House-brewed, not too sweet.', 'Drink', 20.00, '🧋', true, 60),
  ('Calamansi Juice', 'Cold and a little bit sour.', 'Drink', 25.00, '🍋', true, 45)
on conflict (name) do nothing;
