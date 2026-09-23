export type BackgroundType = 'solid' | 'paper' | 'image';
export type BackgroundAnchor = 'top' | 'center' | 'bottom';

export type BackgroundRenderState = {
  schemaVersion?: number;
  id: string;
  sourceVisualRevision: number;
  backgroundId: string;
  selectedBackgroundId?: string;
  type: BackgroundType;
  canvas: {width:number; height:number};
  source: {
    color?: string;
    asset?: string;
    publicRelativePath?: string | null;
    width?: number;
    height?: number;
    assetIdentity?: {size:number; hash:string};
  };
  transform?: {
    fit: 'cover';
    anchor: BackgroundAnchor;
    crop: {x:number; y:number; width:number; height:number};
  };
  appearance: {opacity:number; blur:number; brightness:number};
  transformVersion: 1;
  status: 'resolved' | 'invalid';
  legacyT01Baseline?: boolean;
};
