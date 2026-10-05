/**
 * Rajasthan districts: 41, after the December 2024 reorganisation.
 *
 * Source: Chikitsa-Raj-Workspace scripts/ihms-import/geography/data/lgd_districts.json (LGD codes) and
 * hindi-names.json (hand-written Devanagari). Jaipur (LGD 102) is added by hand: IHMS splits it into
 * "Jaipur I" and "Jaipur II", which are health administration units, not LGD districts.
 *
 * `code` is the uppercase English name with spaces and hyphens as underscores. It appears in the PPO
 * number pattern placeholder ({DIST}). Verify against the RSACS district list (docs/OPEN_QUESTIONS.md Q-03).
 */
export interface DistrictSeed {
  lgdCode: number;
  code: string;
  nameEn: string;
  nameHi: string;
}

export const DISTRICTS: readonly DistrictSeed[] = [
  { lgdCode: 86, code: 'AJMER', nameEn: 'Ajmer', nameHi: 'अजमेर' },
  { lgdCode: 87, code: 'ALWAR', nameEn: 'Alwar', nameHi: 'अलवर' },
  { lgdCode: 88, code: 'BANSWARA', nameEn: 'Banswara', nameHi: 'बांसवाड़ा' },
  { lgdCode: 89, code: 'BARAN', nameEn: 'Baran', nameHi: 'बारां' },
  { lgdCode: 90, code: 'BARMER', nameEn: 'Barmer', nameHi: 'बाड़मेर' },
  { lgdCode: 91, code: 'BHARATPUR', nameEn: 'Bharatpur', nameHi: 'भरतपुर' },
  { lgdCode: 92, code: 'BHILWARA', nameEn: 'Bhilwara', nameHi: 'भीलवाड़ा' },
  { lgdCode: 93, code: 'BIKANER', nameEn: 'Bikaner', nameHi: 'बीकानेर' },
  { lgdCode: 94, code: 'BUNDI', nameEn: 'Bundi', nameHi: 'बूंदी' },
  { lgdCode: 95, code: 'CHITTORGARH', nameEn: 'Chittorgarh', nameHi: 'चित्तौड़गढ़' },
  { lgdCode: 96, code: 'CHURU', nameEn: 'Churu', nameHi: 'चूरू' },
  { lgdCode: 97, code: 'DAUSA', nameEn: 'Dausa', nameHi: 'दौसा' },
  { lgdCode: 98, code: 'DHOLPUR', nameEn: 'Dholpur', nameHi: 'धौलपुर' },
  { lgdCode: 99, code: 'DUNGARPUR', nameEn: 'Dungarpur', nameHi: 'डूंगरपुर' },
  { lgdCode: 100, code: 'GANGANAGAR', nameEn: 'Ganganagar', nameHi: 'गंगानगर' },
  { lgdCode: 101, code: 'HANUMANGARH', nameEn: 'Hanumangarh', nameHi: 'हनुमानगढ़' },
  { lgdCode: 102, code: 'JAIPUR', nameEn: 'Jaipur', nameHi: 'जयपुर' },
  { lgdCode: 103, code: 'JAISALMER', nameEn: 'Jaisalmer', nameHi: 'जैसलमेर' },
  { lgdCode: 104, code: 'JALORE', nameEn: 'Jalore', nameHi: 'जालोर' },
  { lgdCode: 105, code: 'JHALAWAR', nameEn: 'Jhalawar', nameHi: 'झालावाड़' },
  { lgdCode: 106, code: 'JHUNJHUNU', nameEn: 'Jhunjhunu', nameHi: 'झुंझुनूं' },
  { lgdCode: 107, code: 'JODHPUR', nameEn: 'Jodhpur', nameHi: 'जोधपुर' },
  { lgdCode: 108, code: 'KARAULI', nameEn: 'Karauli', nameHi: 'करौली' },
  { lgdCode: 109, code: 'KOTA', nameEn: 'Kota', nameHi: 'कोटा' },
  { lgdCode: 110, code: 'NAGAUR', nameEn: 'Nagaur', nameHi: 'नागौर' },
  { lgdCode: 111, code: 'PALI', nameEn: 'Pali', nameHi: 'पाली' },
  { lgdCode: 112, code: 'RAJSAMAND', nameEn: 'Rajsamand', nameHi: 'राजसमंद' },
  { lgdCode: 113, code: 'SAWAI_MADHOPUR', nameEn: 'Sawai Madhopur', nameHi: 'सवाई माधोपुर' },
  { lgdCode: 114, code: 'SIKAR', nameEn: 'Sikar', nameHi: 'सीकर' },
  { lgdCode: 115, code: 'SIROHI', nameEn: 'Sirohi', nameHi: 'सिरोही' },
  { lgdCode: 116, code: 'TONK', nameEn: 'Tonk', nameHi: 'टोंक' },
  { lgdCode: 117, code: 'UDAIPUR', nameEn: 'Udaipur', nameHi: 'उदयपुर' },
  { lgdCode: 629, code: 'PRATAPGARH', nameEn: 'Pratapgarh', nameHi: 'प्रतापगढ़' },
  { lgdCode: 767, code: 'DEEG', nameEn: 'Deeg', nameHi: 'डीग' },
  { lgdCode: 768, code: 'DEEDWANA_KUCHAMAN', nameEn: 'Deedwana Kuchaman', nameHi: 'डीडवाना कुचामन' },
  { lgdCode: 770, code: 'KHAIRTHAL_TIJARA', nameEn: 'Khairthal-Tijara', nameHi: 'खैरथल-तिजारा' },
  { lgdCode: 772, code: 'PHALODI', nameEn: 'Phalodi', nameHi: 'फलोदी' },
  { lgdCode: 774, code: 'BEAWAR', nameEn: 'Beawar', nameHi: 'ब्यावर' },
  { lgdCode: 775, code: 'BALOTRA', nameEn: 'Balotra', nameHi: 'बालोतरा' },
  { lgdCode: 777, code: 'SALUMBAR', nameEn: 'Salumbar', nameHi: 'सलूंबर' },
  { lgdCode: 782, code: 'KOTPUTLI_BEHROR', nameEn: 'Kotputli Behror', nameHi: 'कोटपूतली-बहरोड़' },
];
