import React from 'react';
import { generateBrandIntroPoster } from '../engine/posterGenerator';
import { PosterDialog } from './PosterDialog';
import type { ToastTone } from './Toast';

interface BrandPosterModalProps {
  onClose: () => void;
  onNotify?: (text: string, tone?: ToastTone) => void;
  closing?: boolean;
}

export const BrandPosterModal: React.FC<BrandPosterModalProps> = ({ onClose, onNotify, closing }) => (
  <PosterDialog
    testIds={{
      root: 'brand-poster-modal',
      img: 'brand-poster-preview-img',
      save: 'download-brand-poster-btn',
    }}
    zClass="z-[60]"
    title="邀请函"
    closeLabel="关闭官方邀请海报"
    imgAlt="微醺研究所 MixLab 官方产品介绍二维码海报"
    loadingText="邀请函印制中…"
    errorText="邀请函海报生成失败，请重试"
    saveLabel="保存邀请函"
    filename="MixLab-微醺研究所-官方邀请函海报.png"
    generate={generateBrandIntroPoster}
    onClose={onClose}
    onNotify={onNotify}
    closing={closing}
  />
);
