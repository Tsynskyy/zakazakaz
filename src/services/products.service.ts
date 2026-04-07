import { pool } from '../db/pool';
import { AppError } from '../errors';
import type { components } from '../generated/api';

type ProductResponse = components['schemas']['ProductResponse'];
type ProductCreate = components['schemas']['ProductCreate'];
type ProductUpdate = components['schemas']['ProductUpdate'];
type ProductStatus = components['schemas']['ProductStatus'];

export interface ProductListQuery {
  page: number;
  size: number;
  status?: string;
  category?: string;
}

export interface ProductListResult {
  items: ProductResponse[];
  totalElements: number;
  page: number;
  size: number;
}

function rowToProduct(row: Record<string, unknown>): ProductResponse {
  return {
    id: row['id'] as string,
    name: row['name'] as string,
    description: (row['description'] as string | null) ?? null,
    price: parseFloat(row['price'] as string),
    stock: row['stock'] as number,
    category: row['category'] as string,
    status: row['status'] as ProductStatus,
    seller_id: (row['seller_id'] as string | null) ?? null,
    created_at: (row['created_at'] as Date).toISOString(),
    updated_at: (row['updated_at'] as Date).toISOString(),
  };
}

export async function listProducts(query: ProductListQuery): Promise<ProductListResult> {
  const { page, size, status, category } = query;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  if (category) {
    params.push(category);
    conditions.push(`category = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRes = await pool.query<{ count: string }>(`SELECT COUNT(*) AS count FROM products ${where}`, params);

  const dataParams = [...params, size, page * size];
  const dataRes = await pool.query(
    `SELECT * FROM products ${where} ORDER BY created_at DESC LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
    dataParams
  );

  return {
    items: dataRes.rows.map(rowToProduct),
    totalElements: parseInt(countRes.rows[0]!.count, 10),
    page,
    size,
  };
}

export async function getProductById(id: string): Promise<ProductResponse> {
  const res = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
  if (!res.rows[0]) throw new AppError('PRODUCT_NOT_FOUND', `Product ${id} not found`);

  return rowToProduct(res.rows[0]);
}

export async function createProduct(data: ProductCreate, sellerId: string | null): Promise<ProductResponse> {
  const res = await pool.query(
    `INSERT INTO products (name, description, price, stock, category, status, seller_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [data.name, data.description ?? null, data.price, data.stock, data.category, data.status, sellerId]
  );

  return rowToProduct(res.rows[0]);
}

export async function updateProduct(
  id: string,
  data: ProductUpdate,
  requesterId: string,
  requesterRole: string
): Promise<ProductResponse> {
  const existing = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
  if (!existing.rows[0]) throw new AppError('PRODUCT_NOT_FOUND', `Product ${id} not found`);

  const product = existing.rows[0];

  if (product.status === 'ARCHIVED') throw new AppError('PRODUCT_NOT_FOUND', `Product ${id} not found`);
  if (requesterRole === 'SELLER' && product.seller_id !== requesterId)
    throw new AppError('ACCESS_DENIED', 'You can only update your own products');

  const fields: string[] = [];
  const params: unknown[] = [];

  for (const key of ['name', 'description', 'price', 'stock', 'category', 'status'] as Array<keyof ProductUpdate>)
    if (data[key] !== undefined) {
      params.push(data[key]);
      fields.push(`${key} = $${params.length}`);
    }

  if (!fields.length) return rowToProduct(product);

  params.push(id);
  const res = await pool.query(`UPDATE products SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`, params);

  return rowToProduct(res.rows[0]);
}

export async function archiveProduct(id: string, requesterId: string, requesterRole: string): Promise<void> {
  const existing = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
  if (!existing.rows[0]) throw new AppError('PRODUCT_NOT_FOUND', `Product ${id} not found`);

  const product = existing.rows[0];

  if (product.status === 'ARCHIVED') return;
  if (requesterRole === 'SELLER' && product.seller_id !== requesterId)
    throw new AppError('ACCESS_DENIED', 'You can only archive your own products');

  await pool.query("UPDATE products SET status = 'ARCHIVED' WHERE id = $1", [id]);
}
