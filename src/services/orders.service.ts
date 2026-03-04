import type { PoolClient } from 'pg';
import { config } from '../config';
import { pool } from '../db/pool';
import { AppError } from '../errors';
import type { components } from '../generated/api';

type OrderResponse = components['schemas']['OrderResponse'];
type OrderItemResponse = components['schemas']['OrderItemResponse'];
type OrderItem = components['schemas']['OrderItem'];
type OrderStatus = components['schemas']['OrderStatus'];

interface OrderRow {
  id: string;
  user_id: string;
  status: OrderStatus;
  promo_code_id: string | null;
  total_amount: string;
  discount_amount: string;
  created_at: Date;
  updated_at: Date;
}

interface OrderItemRow {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  price_at_order: string;
}

interface ProductSnapshot {
  id: string;
  price: number;
  stock: number;
}

interface PromoRow {
  id: string;
  discount_type: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discount_value: string;
  min_order_amount: string;
  max_uses: number;
  current_uses: number;
  valid_from: Date;
  valid_until: Date;
  active: boolean;
}

function rowToOrderItem(row: OrderItemRow): OrderItemResponse {
  return {
    id: row.id,
    product_id: row.product_id,
    quantity: row.quantity,
    price_at_order: parseFloat(row.price_at_order),
  };
}

function rowToOrder(row: OrderRow, items: OrderItemRow[]): OrderResponse {
  return {
    id: row.id,
    user_id: row.user_id,
    status: row.status,
    promo_code_id: row.promo_code_id ?? null,
    total_amount: parseFloat(row.total_amount),
    discount_amount: parseFloat(row.discount_amount),
    items: items.map(rowToOrderItem),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

async function loadOrder(id: string, client: PoolClient): Promise<OrderResponse> {
  const orderRes = await client.query<OrderRow>('SELECT * FROM orders WHERE id = $1', [id]);
  if (!orderRes.rows[0]) throw new AppError('ORDER_NOT_FOUND', `Order ${id} not found`);

  const itemsRes = await client.query<OrderItemRow>('SELECT * FROM order_items WHERE order_id = $1', [id]);

  return rowToOrder(orderRes.rows[0], itemsRes.rows);
}

async function checkRateLimit(userId: string, opType: 'CREATE_ORDER' | 'UPDATE_ORDER', client: PoolClient): Promise<void> {
  const res = await client.query<{ created_at: Date }>(
    `SELECT created_at FROM user_operations WHERE user_id = $1 AND operation_type = $2 ORDER BY created_at DESC LIMIT 1`,
    [userId, opType]
  );

  if (res.rows[0]) {
    const elapsed = (Date.now() - res.rows[0].created_at.getTime()) / 1000 / 60;

    if (elapsed < config.orderRateLimitMinutes) {
      throw new AppError(
        'ORDER_LIMIT_EXCEEDED',
        `Too many requests. Try again in ${Math.ceil(config.orderRateLimitMinutes - elapsed)} minute(s).`
      );
    }
  }
}

async function validateAndLockProducts(items: OrderItem[], client: PoolClient): Promise<Map<string, ProductSnapshot>> {
  const ids = [...new Set(items.map((i) => i.product_id))];
  const res = await client.query<{ id: string; status: string; price: string; stock: number }>(
    `SELECT id, status, price, stock FROM products WHERE id = ANY($1) FOR UPDATE`,
    [ids]
  );
  const byId = new Map(res.rows.map((r) => [r.id, r]));

  for (const item of items) {
    const product = byId.get(item.product_id);

    if (!product) throw new AppError('PRODUCT_NOT_FOUND', `Product ${item.product_id} not found`);

    if (product.status !== 'ACTIVE') throw new AppError('PRODUCT_INACTIVE', `Product ${item.product_id} is not active`);
  }

  const needed = new Map<string, number>();

  for (const item of items) needed.set(item.product_id, (needed.get(item.product_id) ?? 0) + item.quantity);

  const stockErrors: Array<{ product_id: string; requested: number; available: number }> = [];

  for (const [productId, qty] of needed) {
    const product = byId.get(productId)!;

    if (product.stock < qty) stockErrors.push({ product_id: productId, requested: qty, available: product.stock });
  }

  if (stockErrors.length)
    throw new AppError('INSUFFICIENT_STOCK', 'Insufficient stock for one or more products', { items: stockErrors });

  return new Map(res.rows.map((r) => [r.id, { id: r.id, price: parseFloat(r.price), stock: r.stock }]));
}

async function reserveStock(items: OrderItem[], client: PoolClient): Promise<void> {
  const needed = new Map<string, number>();

  for (const item of items) needed.set(item.product_id, (needed.get(item.product_id) ?? 0) + item.quantity);

  for (const [productId, qty] of needed)
    await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [qty, productId]);
}

async function returnStock(orderId: string, client: PoolClient): Promise<void> {
  await client.query(
    `UPDATE products p SET stock = stock + oi.quantity FROM order_items oi WHERE oi.order_id = $1 AND oi.product_id = p.id`,
    [orderId]
  );
}

function calcDiscount(promo: PromoRow, totalAmount: number): number {
  const value = parseFloat(promo.discount_value);

  if (promo.discount_type === 'PERCENTAGE') return Math.round(totalAmount * Math.min(value, 70)) / 100;

  return Math.min(value, totalAmount);
}

function isPromoValid(promo: PromoRow): boolean {
  const now = new Date();
  return promo.active && promo.current_uses < promo.max_uses && now >= promo.valid_from && now <= promo.valid_until;
}

async function applyPromoCode(
  code: string,
  totalAmount: number,
  client: PoolClient
): Promise<{ promoCodeId: string; discountAmount: number }> {
  const res = await client.query<PromoRow>(`SELECT * FROM promo_codes WHERE code = $1 FOR UPDATE`, [code]);
  const promo = res.rows[0];

  if (!promo || !isPromoValid(promo))
    throw new AppError('PROMO_CODE_INVALID', `Promo code "${code}" is invalid, expired, or exhausted`);

  const minAmount = parseFloat(promo.min_order_amount);
  if (totalAmount < minAmount)
    throw new AppError(
      'PROMO_CODE_MIN_AMOUNT',
      `Order total ${totalAmount} is below minimum ${minAmount} for this promo code`
    );

  await client.query('UPDATE promo_codes SET current_uses = current_uses + 1 WHERE id = $1', [promo.id]);

  return { promoCodeId: promo.id, discountAmount: calcDiscount(promo, totalAmount) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function insertItems(
  orderId: string,
  items: OrderItem[],
  products: Map<string, ProductSnapshot>,
  client: PoolClient
): Promise<OrderItemRow[]> {
  const rows: OrderItemRow[] = [];

  for (const item of items) {
    const res = await client.query<OrderItemRow>(
      `INSERT INTO order_items (order_id, product_id, quantity, price_at_order) VALUES ($1, $2, $3, $4) RETURNING *`,
      [orderId, item.product_id, item.quantity, products.get(item.product_id)!.price]
    );

    rows.push(res.rows[0]!);
  }

  return rows;
}

export async function createOrder(userId: string, items: OrderItem[], promoCode?: string | null): Promise<OrderResponse> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await checkRateLimit(userId, 'CREATE_ORDER', client);

    const activeRes = await client.query(
      `SELECT id FROM orders WHERE user_id = $1 AND status IN ('CREATED', 'PAYMENT_PENDING') LIMIT 1`,
      [userId]
    );
    if (activeRes.rows[0]) throw new AppError('ORDER_HAS_ACTIVE', 'You already have an active order');

    const products = await validateAndLockProducts(items, client);
    await reserveStock(items, client);

    let totalAmount = round2(items.reduce((sum, item) => sum + products.get(item.product_id)!.price * item.quantity, 0));

    let discountAmount = 0;
    let promoCodeId: string | null = null;

    if (promoCode) {
      const promo = await applyPromoCode(promoCode, totalAmount, client);
      discountAmount = promo.discountAmount;
      promoCodeId = promo.promoCodeId;
      totalAmount = round2(totalAmount - discountAmount);
    }

    const orderRes = await client.query<OrderRow>(
      `INSERT INTO orders (user_id, status, promo_code_id, total_amount, discount_amount) VALUES ($1, 'CREATED', $2, $3, $4) RETURNING *`,
      [userId, promoCodeId, totalAmount, discountAmount]
    );
    const order = orderRes.rows[0]!;

    const itemRows = await insertItems(order.id, items, products, client);

    await client.query(`INSERT INTO user_operations (user_id, operation_type) VALUES ($1, 'CREATE_ORDER')`, [userId]);
    await client.query('COMMIT');

    return rowToOrder(order, itemRows);
  } catch (err) {
    await client.query('ROLLBACK');

    throw err;
  } finally {
    client.release();
  }
}

export async function getOrder(orderId: string, requesterId: string, requesterRole: string): Promise<OrderResponse> {
  const client = await pool.connect();

  try {
    const order = await loadOrder(orderId, client);

    if (requesterRole !== 'ADMIN' && order.user_id !== requesterId)
      throw new AppError('ORDER_OWNERSHIP_VIOLATION', 'This order belongs to another user');

    return order;
  } finally {
    client.release();
  }
}

export async function updateOrder(
  orderId: string,
  newItems: OrderItem[],
  requesterId: string,
  requesterRole: string
): Promise<OrderResponse> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const orderRes = await client.query<OrderRow>('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    if (!orderRes.rows[0]) throw new AppError('ORDER_NOT_FOUND', `Order ${orderId} not found`);
    const order = orderRes.rows[0];

    if (requesterRole !== 'ADMIN' && order.user_id !== requesterId)
      throw new AppError('ORDER_OWNERSHIP_VIOLATION', 'This order belongs to another user');

    if (order.status !== 'CREATED')
      throw new AppError('INVALID_STATE_TRANSITION', `Order can only be updated in CREATED state, current: ${order.status}`);

    await checkRateLimit(requesterId, 'UPDATE_ORDER', client);
    await returnStock(orderId, client);

    const products = await validateAndLockProducts(newItems, client);
    await reserveStock(newItems, client);

    let totalAmount = round2(newItems.reduce((sum, item) => sum + products.get(item.product_id)!.price * item.quantity, 0));

    let discountAmount = 0;
    let promoCodeId: string | null = order.promo_code_id;

    if (promoCodeId) {
      const promoRes = await client.query<PromoRow>('SELECT * FROM promo_codes WHERE id = $1', [promoCodeId]);
      const promo = promoRes.rows[0];

      if (!promo || !isPromoValid(promo) || totalAmount < parseFloat(promo.min_order_amount)) {
        await client.query('UPDATE promo_codes SET current_uses = current_uses - 1 WHERE id = $1', [promoCodeId]);
        promoCodeId = null;
      } else {
        discountAmount = calcDiscount(promo, totalAmount);
        totalAmount = round2(totalAmount - discountAmount);
      }
    }

    await client.query('DELETE FROM order_items WHERE order_id = $1', [orderId]);
    const itemRows = await insertItems(orderId, newItems, products, client);

    const updatedRes = await client.query<OrderRow>(
      `UPDATE orders SET total_amount = $1, discount_amount = $2, promo_code_id = $3 WHERE id = $4 RETURNING *`,
      [totalAmount, discountAmount, promoCodeId, orderId]
    );

    await client.query(`INSERT INTO user_operations (user_id, operation_type) VALUES ($1, 'UPDATE_ORDER')`, [requesterId]);
    await client.query('COMMIT');

    return rowToOrder(updatedRes.rows[0]!, itemRows);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function cancelOrder(orderId: string, requesterId: string, requesterRole: string): Promise<OrderResponse> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const orderRes = await client.query<OrderRow>('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    if (!orderRes.rows[0]) throw new AppError('ORDER_NOT_FOUND', `Order ${orderId} not found`);
    const order = orderRes.rows[0];

    if (requesterRole !== 'ADMIN' && order.user_id !== requesterId)
      throw new AppError('ORDER_OWNERSHIP_VIOLATION', 'This order belongs to another user');

    if (order.status !== 'CREATED' && order.status !== 'PAYMENT_PENDING')
      throw new AppError('INVALID_STATE_TRANSITION', `Cannot cancel order in state: ${order.status}`);

    await returnStock(orderId, client);

    if (order.promo_code_id)
      await client.query('UPDATE promo_codes SET current_uses = current_uses - 1 WHERE id = $1', [order.promo_code_id]);

    const updatedRes = await client.query<OrderRow>(`UPDATE orders SET status = 'CANCELED' WHERE id = $1 RETURNING *`, [
      orderId,
    ]);
    const itemsRes = await client.query<OrderItemRow>('SELECT * FROM order_items WHERE order_id = $1', [orderId]);

    await client.query('COMMIT');

    return rowToOrder(updatedRes.rows[0]!, itemsRes.rows);
  } catch (err) {
    await client.query('ROLLBACK');

    throw err;
  } finally {
    client.release();
  }
}
