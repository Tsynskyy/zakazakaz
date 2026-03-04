create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create type user_role as enum ('USER', 'SELLER', 'ADMIN');

create table users (
  id         uuid primary key default gen_random_uuid(),
  email      varchar(255) not null unique,
  password   varchar(255) not null,
  role       user_role    not null default 'USER',
  created_at timestamptz  not null default now(),
  updated_at timestamptz  not null default now()
);

create trigger users_set_updated_at
  before update on users
  for each row execute function set_updated_at();

create table refresh_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null references users(id) on delete cascade,
  token      varchar(512) not null unique,
  expires_at timestamptz  not null,
  created_at timestamptz  not null default now()
);

create type product_status as enum ('ACTIVE', 'INACTIVE', 'ARCHIVED');

create table products (
  id          uuid primary key default gen_random_uuid(),
  name        varchar(255)   not null,
  description varchar(4000),
  price       decimal(12,2)  not null check (price > 0),
  stock       integer        not null check (stock >= 0),
  category    varchar(100)   not null,
  status      product_status not null default 'ACTIVE',
  seller_id   uuid references users(id),
  created_at  timestamptz    not null default now(),
  updated_at  timestamptz    not null default now()
);

create trigger products_set_updated_at
  before update on products
  for each row execute function set_updated_at();

create type discount_type as enum ('PERCENTAGE', 'FIXED_AMOUNT');

create table promo_codes (
  id               uuid primary key default gen_random_uuid(),
  code             varchar(20)   not null unique,
  discount_type    discount_type not null,
  discount_value   decimal(12,2) not null check (discount_value > 0),
  min_order_amount decimal(12,2) not null default 0 check (min_order_amount >= 0),
  max_uses         integer       not null check (max_uses > 0),
  current_uses     integer       not null default 0 check (current_uses >= 0),
  valid_from       timestamptz   not null,
  valid_until      timestamptz   not null,
  active           boolean       not null default true,
  created_at       timestamptz   not null default now()
);

create type order_status as enum ('CREATED', 'PAYMENT_PENDING', 'PAID', 'SHIPPED', 'COMPLETED', 'CANCELED');

create table orders (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid          not null references users(id),
  status          order_status  not null default 'CREATED',
  promo_code_id   uuid references promo_codes(id),
  total_amount    decimal(12,2) not null check (total_amount >= 0),
  discount_amount decimal(12,2) not null default 0 check (discount_amount >= 0),
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now()
);

create trigger orders_set_updated_at
  before update on orders
  for each row execute function set_updated_at();

create table order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid          not null references orders(id) on delete cascade,
  product_id     uuid          not null references products(id),
  quantity       integer       not null check (quantity > 0),
  price_at_order decimal(12,2) not null check (price_at_order > 0)
);

create type operation_type as enum ('CREATE_ORDER', 'UPDATE_ORDER');

create table user_operations (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid           not null references users(id),
  operation_type operation_type not null,
  created_at     timestamptz    not null default now()
);
