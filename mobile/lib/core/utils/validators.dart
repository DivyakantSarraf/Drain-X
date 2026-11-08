class Validators {
  static String? validateDescription(String? value) {
    if (value == null || value.trim().isEmpty) {
      return 'Description is required';
    }
    if (value.trim().length < 3) {
      return 'Description must be at least 3 characters long';
    }
    if (value.trim().length > 1000) {
      return 'Description cannot exceed 1000 characters';
    }
    return null;
  }

  static String? validateLatitude(String? value) {
    if (value == null || value.trim().isEmpty) {
      return 'Latitude is required';
    }
    final lat = double.tryParse(value.trim());
    if (lat == null) {
      return 'Must be a valid number';
    }
    if (lat < -90.0 || lat > 90.0) {
      return 'Latitude must be between -90 and 90';
    }
    return null;
  }

  static String? validateLongitude(String? value) {
    if (value == null || value.trim().isEmpty) {
      return 'Longitude is required';
    }
    final lng = double.tryParse(value.trim());
    if (lng == null) {
      return 'Must be a valid number';
    }
    if (lng < -180.0 || lng > 180.0) {
      return 'Longitude must be between -180 and 180';
    }
    return null;
  }
}
