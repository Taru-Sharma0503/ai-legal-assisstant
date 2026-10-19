export const OFFICE_CATEGORIES = [
  'Birth Certificate',
  'Caste Certificate',
  'Income Certificate',
  'Domicile Certificate'
];

const categoryByKey = new Map(OFFICE_CATEGORIES.map((category) => [
  category.toLocaleLowerCase().replace(/[^a-z]/g, ''),
  category
]));

export const normalizeOfficeCategory = (value) => {
  if (typeof value !== 'string') return null;
  return categoryByKey.get(value.trim().toLocaleLowerCase().replace(/[^a-z]/g, '')) || null;
};
