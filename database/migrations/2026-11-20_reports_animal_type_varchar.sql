-- Widen reports.animal_type from ENUM to VARCHAR(100) so custom animal types entered under 'Others' (e.g. Rabbit, Bird, Turtle, Snake, Hamster) are stored directly
ALTER TABLE reports
  MODIFY COLUMN animal_type VARCHAR(100) NULL DEFAULT 'Unknown';
