export interface Profile {
  id: string;
  free_receipts_used: number;
  created_at: string;
}

export interface Receipt {
  id: string;
  user_id: string;
  store_name: string | null;
  receipt_date: string | null;
  photo_url: string | null;
  item_count: number;
  created_at: string;
}

export interface PriceEntry {
  id: string;
  receipt_id: string;
  user_id: string;
  item_name: string;
  price: number;
  quantity: number | null;
  unit: string | null;
  created_at: string;
}

export interface ItemStats {
  item_name: string;
  latest_price: number;
  avg_price: number;
  low_price: number;
  high_price: number;
  price_count: number;
  last_seen: string;
}
