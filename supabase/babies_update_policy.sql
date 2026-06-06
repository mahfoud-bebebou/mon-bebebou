-- Permet la mise à jour du profil bébé depuis /profil
DROP POLICY IF EXISTS "Users can update babies" ON babies;

CREATE POLICY "Users can update babies" ON babies
  FOR UPDATE USING (true);
