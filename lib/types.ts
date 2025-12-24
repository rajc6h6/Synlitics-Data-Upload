export type UploadSource = 'UberEats' | 'DoorDash' | 'Grubhub' | 'Offline';

export type ProcessingStatus = 'pending' | 'processing' | 'completed';

export interface Profile {
  id: string;
  restaurant_name: string;
  created_at: string;
  updated_at: string;
}

export interface DailyUpload {
  id: string;
  user_id: string;
  restaurant_name: string;
  upload_date: string;
  ubereats_ready: boolean;
  doordash_ready: boolean;
  grubhub_ready: boolean;
  offline_ready: boolean;
  processing_status: ProcessingStatus;
  created_at: string;
  updated_at: string;
}

export interface UploadSlot {
  source: UploadSource;
  label: string;
  key: keyof Pick<DailyUpload, 'ubereats_ready' | 'doordash_ready' | 'grubhub_ready' | 'offline_ready'>;
  color: string;
}
