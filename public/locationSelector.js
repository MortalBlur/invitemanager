let map;
let marker;

// Initialize the map
function initMap() {
  const defaultLocation = { lat: 28.6139, lng: 77.209 }; // Default location (e.g., New Delhi)
  map = new google.maps.Map(document.getElementById('map'), {
    center: defaultLocation,
    zoom: 12,
  });

  // Add a draggable marker to the map
  marker = new google.maps.Marker({
    position: defaultLocation,
    map: map,
    draggable: true,
  });

  // Update location details when the marker is dragged
  google.maps.event.addListener(marker, 'dragend', function () {
    const position = marker.getPosition();
    updateLocationDetails(position.lat(), position.lng());
  });

  // Autocomplete for the search box
  const searchBox = document.getElementById('searchBox');
  const autocomplete = new google.maps.places.Autocomplete(searchBox);

  // Listen for place selection
  autocomplete.addListener('place_changed', function () {
    const place = autocomplete.getPlace();
    if (!place.geometry) return;

    // Center the map on the selected place
    map.setCenter(place.geometry.location);
    map.setZoom(15);

    // Update marker position
    marker.setPosition(place.geometry.location);

    // Update location details
    updateLocationDetails(place.geometry.location.lat(), place.geometry.location.lng());
  });
}

// Update location details based on latitude and longitude
function updateLocationDetails(lat, lng) {
  const geocoder = new google.maps.Geocoder();

  geocoder.geocode({ location: { lat, lng } }, function (results, status) {
    if (status === 'OK' && results[0]) {
      const address = results[0].formatted_address; // Extract the formatted address
      document.getElementById('selectedAddress').textContent = address;
      document.getElementById('latitude').textContent = lat;
      document.getElementById('longitude').textContent = lng;

      // Optionally, send these details to the backend via an API call
      console.log('Selected Location:', { address, lat, lng });
    } else {
      console.error('Geocoding failed:', status);
    }
  });
}

// Initialize the map when the page loads
window.onload = initMap;