import { pool } from '../db/pool';
import { AppError } from '../errors';
import type { components } from '../generated/api';

type PromoCodeCreate = components['schemas']['PromoCodeCreate'];
type PromoCodeResponse = components['schemas']['PromoCodeResponse'];

interface PromoRow {
  id: string;
  code: string;
  discount_type: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discount_value: string;
  min_order_amount: string;
  max_uses: number;
  current_uses: number;
  valid_from: Date;
  valid_until: Date;
  active: boolean;
}

function rowToPromoCode(row: PromoRow): PromoCodeResponse {
  return {
    id: row.id,
    code: row.code,
    discount_type: row.discount_type,
    discount_value: parseFloat(row.discount_value),
    min_order_amount: parseFloat(row.min_order_amount),
    max_uses: row.max_uses,
    current_uses: row.current_uses,
    valid_from: row.valid_from.toISOString(),
    valid_until: row.valid_until.toISOString(),
    active: row.active,
  };
}

export async function createPromoCode(data: PromoCodeCreate): Promise<PromoCodeResponse> {
  try {
    const res = await pool.query<PromoRow>(
      `INSERT INTO promo_codes
         (code, discount_type, discount_value, min_order_amount, max_uses, valid_from, valid_until)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        data.code,
        data.discount_type,
        data.discount_value,
        data.min_order_amount,
        data.max_uses,
        data.valid_from,
        data.valid_until,
      ]
    );

    return rowToPromoCode(res.rows[0]!);
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505')
      throw new AppError('VALIDATION_ERROR', `Promo code "${data.code}" already exists`);

    throw err;
  }
}
