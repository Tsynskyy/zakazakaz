create index idx_products_status   on products (status);
create index idx_products_category on products (category);
create index idx_products_seller   on products (seller_id);

create index idx_orders_user_id on orders (user_id);
create index idx_orders_status  on orders (status);

create index idx_order_items_order_id   on order_items (order_id);
create index idx_order_items_product_id on order_items (product_id);

create index idx_user_ops_user_type_ts
  on user_operations (user_id, operation_type, created_at desc);

create index idx_refresh_tokens_user_id on refresh_tokens (user_id);
