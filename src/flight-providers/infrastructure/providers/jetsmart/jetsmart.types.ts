export type JetSmartPriceByCurrency = {
  ars?: number;
  usd?: number;
  clp?: number;
  [key: string]: number | undefined;
};

export type JetSmartAvailabilityItem = {
  dep?: string;
  arr?: string;
  fn?: string;
  date?: string;
  market?: string;
  p?: JetSmartPriceByCurrency;
  i?: JetSmartPriceByCurrency;
  pi?: JetSmartPriceByCurrency;
  rfb?: {
    dep?: string;
    arr?: string;
    fn?: string;
    date?: string;
    market?: string;
    p?: JetSmartPriceByCurrency;
    i?: JetSmartPriceByCurrency;
    pi?: JetSmartPriceByCurrency;
  };
};

export type JetSmartAvailabilityResponse = {
  availability?: JetSmartAvailabilityItem[];
};
