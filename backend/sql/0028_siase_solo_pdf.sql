-- 0028: El reporte SIASE solo se acepta en PDF (antes PDF o imagen), el formato
-- establecido que pidió la coordinación. Los archivos ya subidos se siguen viendo.
--
-- Se aplica al publicar la web que ya avisa "Solo PDF" y revisa el archivo antes de
-- subirlo: con la web anterior, una foto fallaría con un error genérico.
begin;

update storage.buckets
set allowed_mime_types = array['application/pdf']
where id = 'siase';

commit;
