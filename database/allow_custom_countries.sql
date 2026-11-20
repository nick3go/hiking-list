alter table hikes_private.hikes drop constraint hikes_country_check;
alter table hikes_private.hikes add constraint hikes_country_check check (char_length(btrim(country)) between 1 and 80);

