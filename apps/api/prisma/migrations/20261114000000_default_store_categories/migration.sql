INSERT INTO `store_categories` (`nameAr`, `sort_order`, `is_active`)
VALUES ('مطاعم', 0, true),
       ('سوبر ماركت', 1, true),
       ('مول', 2, true),
       ('مخبز', 3, true),
       ('محل جوالات', 4, true)
ON DUPLICATE KEY UPDATE `is_active` = true;
