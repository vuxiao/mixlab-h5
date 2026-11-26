import React, { useCallback } from 'react';
import { generateCocktailPoster } from '../engine/posterGenerator';
import { DrinkEvaluation } from '../types';
import { PosterDialog } from './PosterDialog';
import type { ToastTone } from './Toast';

interface PosterModalProps {
  drink: DrinkEvaluation;
  challengeStars?: number;
  onClose: () => void;
  onNotify?: (text: string, tone?: ToastTone) => void;
  closing?: boolean;
}

export const PosterModal: React.FC<PosterModalProps> = ({
  drink,
  challengeStars,
  onClose,
  onNotify,
  closing,
}) => {
  const generate = useCallback(
    () => generateCocktailPoster(drink, challengeStars),
    [drink, challengeStars]
  );

  return (
    <PosterDialog
      key={`${drink.serialNo}-${challengeStars ?? 0}`}
      testIds={{ root: 'poster-modal', img: 'poster-preview-img', save: 'download-poster-btn' }}
      zClass="z-50"
      title={drink.name}
      closeLabel="关闭海报预览"
      imgAlt={`${drink.name} 特调酒单海报`}
      loadingText="海报印制中…"
      errorText="海报渲染失败，请重试"
      saveLabel="保存海报"
      filename={`MixLab-${drink.serialNo}-${drink.name}.png`}
      generate={generate}
      onClose={onClose}
      onNotify={onNotify}
      closing={closing}
    />
  );
};
